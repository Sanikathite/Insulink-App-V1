'use strict';

const { Op } = require('sequelize');
const { AlarmLog, Channel, Device, Site, User, NotificationPreference } = require('../models');

const severityRank = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3
};

const resolveAlarmSeverity = (severity) => {
  const normalized = String(severity || '').toUpperCase();
  return severityRank[normalized] || 0;
};

const shouldNotifyBySeverity = (alarmSeverity, minSeverity) => {
  return resolveAlarmSeverity(alarmSeverity) >= resolveAlarmSeverity(minSeverity);
};

const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  try {
    const twilio = require('twilio');
    return twilio(accountSid, authToken);
  } catch (_error) {
    return null;
  }
};

const normalizePhoneNumber = (rawContact) => {
  const contact = String(rawContact || '').trim();
  if (!contact) return null;

  if (contact.startsWith('+')) {
    const normalized = `+${contact.slice(1).replace(/\D/g, '')}`;
    return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
  }

  const digitsOnly = contact.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    const defaultCode = process.env.OTP_DEFAULT_COUNTRY_CODE || '+91';
    const normalized = `${defaultCode}${digitsOnly}`;
    return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
  }

  if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
    const normalized = `+${digitsOnly}`;
    return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
  }

  return null;
};

const getFirebaseAdmin = () => {
  try {
    return require('firebase-admin');
  } catch (_error) {
    return null;
  }
};

const initFirebaseAdmin = (logger = console) => {
  const admin = getFirebaseAdmin();
  if (!admin) {
    logger.warn('[alarm-push-poller] firebase-admin not installed, running in dry mode');
    return null;
  }

  if (admin.apps.length) {
    return admin;
  }

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      return admin;
    }

    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    return admin;
  } catch (error) {
    logger.warn(`[alarm-push-poller] firebase-admin init failed, running in dry mode: ${error.message}`);
    return null;
  }
};

const buildNotificationPayload = (alarm) => {
  const channel = alarm.channel;
  const device = channel?.device;
  const site = device?.site;

  const title = `${alarm.severity || 'INFO'} Alarm`;
  const body = alarm.alarm_message || channel?.message || channel?.label || 'New active alarm detected';

  return {
    notification: {
      title,
      body
    },
    data: {
      alarm_id: String(alarm.alarm_id),
      status: String(alarm.status || ''),
      severity: String(alarm.severity || ''),
      device_id: String(device?.device_id || ''),
      device_name: String(device?.device_name || ''),
      site_id: String(site?.site_id || ''),
      site_name: String(site?.site_name || ''),
      channel_id: String(channel?.channel_id || ''),
      channel_number: String(channel?.channel_number || ''),
      channel_label: String(channel?.label || ''),
      fault_at: alarm.fault_at ? new Date(alarm.fault_at).toISOString() : ''
    }
  };
};

const findScopedPreferences = async (alarm) => {
  const siteId = alarm.channel?.device?.site_id || null;

  const preferences = await NotificationPreference.findAll({
    where: {
      push_enabled: true,
      fcm_token: {
        [Op.not]: null
      },
      [Op.or]: [
        { site_id: null },
        { site_id: siteId }
      ]
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['user_id', 'name', 'contact', 'account_status'],
        required: true
      }
    ],
    order: [['updated_at', 'DESC']]
  });

  return preferences.filter((pref) => {
    if (pref.user?.account_status !== 'ACTIVE') return false;
    return shouldNotifyBySeverity(alarm.severity, pref.min_severity_level || 'INFO');
  });
};

const buildCriticalSmsBody = (alarm) => {
  const channel = alarm.channel;
  const device = channel?.device;
  const site = device?.site;
  const triggeredAt = alarm.fault_at ? new Date(alarm.fault_at).toISOString() : new Date().toISOString();

  return [
    'CRITICAL ALARM',
    `Site: ${site?.site_name || 'N/A'}`,
    `Device: ${device?.device_name || 'N/A'}`,
    `Channel: ${channel?.channel_number || 'N/A'} (${channel?.label || 'N/A'})`,
    `Message: ${alarm.alarm_message || channel?.message || channel?.label || 'Critical alarm triggered'}`,
    `Time: ${triggeredAt}`
  ].join(' | ');
};

const sendCriticalSmsAlerts = async ({ twilioClient, recipients, alarm, logger }) => {
  if (!recipients.length) {
    return { sent: 0, failed: 0 };
  }

  if (!twilioClient) {
    logger.warn('[alarm-push-poller] Twilio client not available; critical SMS could not be sent');
    return { sent: 0, failed: recipients.length };
  }

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const smsFrom = process.env.TWILIO_SMS_FROM || process.env.TWILIO_PHONE_NUMBER;

  if (!messagingServiceSid && !smsFrom) {
    logger.warn('[alarm-push-poller] TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_FROM is required for SMS alerts');
    return { sent: 0, failed: recipients.length };
  }

  const body = buildCriticalSmsBody(alarm);
  const messageBase = messagingServiceSid
    ? { messagingServiceSid, body }
    : { from: smsFrom, body };

  const results = await Promise.allSettled(
    recipients.map((to) => twilioClient.messages.create({
      to,
      ...messageBase
    }))
  );

  let sent = 0;
  let failed = 0;

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      sent += 1;
    } else {
      failed += 1;
      logger.error(`[alarm-push-poller] critical SMS failed: ${result.reason?.message || 'Unknown error'}`);
    }
  });

  return { sent, failed };
};

exports.createAlarmPushPoller = ({ intervalMs = 10000, lookbackMs = 30000, logger = console } = {}) => {
  let timer = null;
  let lastScanAt = new Date(Date.now() - lookbackMs);
  const sentKeyCache = new Map();
  const sentSmsKeyCache = new Map();
  const firebaseAdmin = initFirebaseAdmin(logger);
  const twilioClient = getTwilioClient();

  const pruneCache = () => {
    const cutOff = Date.now() - 10 * 60 * 1000;
    for (const [key, timestamp] of sentKeyCache.entries()) {
      if (timestamp < cutOff) {
        sentKeyCache.delete(key);
      }
    }

    for (const [key, timestamp] of sentSmsKeyCache.entries()) {
      if (timestamp < cutOff) {
        sentSmsKeyCache.delete(key);
      }
    }
  };

  const pushToFcm = async (tokens, payload) => {
    if (!tokens.length) return { successCount: 0, failureCount: 0 };

    if (!firebaseAdmin) {
      logger.info(`[alarm-push-poller] DRY RUN push to ${tokens.length} token(s): ${payload.notification.title}`);
      return { successCount: tokens.length, failureCount: 0 };
    }

    return firebaseAdmin.messaging().sendEachForMulticast({
      tokens,
      notification: payload.notification,
      data: payload.data
    });
  };

  const tick = async () => {
    const scanStartedAt = new Date();

    try {
      const alarms = await AlarmLog.findAll({
        where: {
          status: 'ACTIVE',
          fault_at: {
            [Op.gt]: lastScanAt
          }
        },
        include: [
          {
            model: Channel,
            as: 'channel',
            required: true,
            attributes: ['channel_id', 'channel_number', 'label', 'message', 'device_id'],
            include: [
              {
                model: Device,
                as: 'device',
                required: true,
                attributes: ['device_id', 'device_name', 'site_id'],
                include: [
                  {
                    model: Site,
                    as: 'site',
                    required: false,
                    attributes: ['site_id', 'site_name']
                  }
                ]
              }
            ]
          }
        ],
        order: [['fault_at', 'ASC']],
        limit: 250
      });

      for (const alarm of alarms) {
        const preferences = await findScopedPreferences(alarm);
        if (!preferences.length) continue;

        const uniqueTokens = Array.from(
          new Set(
            preferences
              .filter((pref) => pref.push_enabled)
              .map((pref) => String(pref.fcm_token || '').trim())
              .filter(Boolean)
          )
        );
        const freshTokens = uniqueTokens.filter((token) => {
          const key = `${alarm.alarm_id}:${token}`;
          if (sentKeyCache.has(key)) return false;
          sentKeyCache.set(key, Date.now());
          return true;
        });

        if (freshTokens.length) {
          const payload = buildNotificationPayload(alarm);
          const result = await pushToFcm(freshTokens, payload);

          logger.info(
            `[alarm-push-poller] alarm=${alarm.alarm_id} pushed=${result.successCount || 0} failed=${result.failureCount || 0}`
          );
        }

        const isCritical = String(alarm.severity || '').toUpperCase() === 'CRITICAL';
        if (isCritical) {
          const smsRecipients = Array.from(
            new Set(
              preferences
                .filter((pref) => pref.sms_enabled)
                .map((pref) => normalizePhoneNumber(pref.user?.contact))
                .filter(Boolean)
            )
          );

          const freshSmsRecipients = smsRecipients.filter((phone) => {
            const key = `${alarm.alarm_id}:${phone}`;
            if (sentSmsKeyCache.has(key)) return false;
            sentSmsKeyCache.set(key, Date.now());
            return true;
          });

          if (freshSmsRecipients.length) {
            const smsResult = await sendCriticalSmsAlerts({
              twilioClient,
              recipients: freshSmsRecipients,
              alarm,
              logger
            });

            logger.info(
              `[alarm-push-poller] alarm=${alarm.alarm_id} critical_sms_sent=${smsResult.sent} critical_sms_failed=${smsResult.failed}`
            );
          }
        }
      }
    } catch (error) {
      logger.error(`[alarm-push-poller] poll failed: ${error.message}`);
    } finally {
      lastScanAt = scanStartedAt;
      pruneCache();
    }
  };

  return {
    start: () => {
      if (timer) return;
      logger.info(`[alarm-push-poller] started with interval ${intervalMs}ms`);
      timer = setInterval(tick, intervalMs);
      tick();
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      logger.info('[alarm-push-poller] stopped');
    },
    tick
  };
};
