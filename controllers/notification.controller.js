'use strict';

const { NotificationPreference } = require('../models');
const { sendError } = require('../functions/sendResponse');

const validSeverities = ['CRITICAL', 'WARNING', 'INFO'];

const normalizeOptionalSiteId = (rawValue) => {
  if (rawValue === undefined) {
    return { ok: true, value: null };
  }

  if (rawValue === null || rawValue === '' || String(rawValue).toLowerCase() === 'null') {
    return { ok: true, value: null };
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return { ok: false };
  }

  return { ok: true, value: parsed };
};

exports.getNotificationPreference = async (req, res, next) => {
  try {
    if (!req.user?.user_id) {
      return sendError(next, 'Unauthorized', 401);
    }

    const normalizedSite = normalizeOptionalSiteId(req.query.site_id);
    if (!normalizedSite.ok) {
      return sendError(next, 'Invalid site_id', 400);
    }

    const where = {
      user_id: req.user.user_id,
      site_id: normalizedSite.value
    };

    let preference = await NotificationPreference.findOne({ where });
    if (!preference) {
      preference = await NotificationPreference.create(where);
    }

    return res.status(200).json({
      success: true,
      data: preference
    });
  } catch (error) {
    next(error);
  }
};

exports.upsertNotificationPreference = async (req, res, next) => {
  try {
    if (!req.user?.user_id) {
      return sendError(next, 'Unauthorized', 401);
    }

    const normalizedSite = normalizeOptionalSiteId(req.body.site_id);
    if (!normalizedSite.ok) {
      return sendError(next, 'Invalid site_id', 400);
    }

    const updates = {};

    if (req.body.push_enabled !== undefined) updates.push_enabled = Boolean(req.body.push_enabled);
    if (req.body.sms_enabled !== undefined) updates.sms_enabled = Boolean(req.body.sms_enabled);
    if (req.body.sound_enabled !== undefined) updates.sound_enabled = Boolean(req.body.sound_enabled);
    if (req.body.vibration_enabled !== undefined) updates.vibration_enabled = Boolean(req.body.vibration_enabled);

    if (req.body.min_severity_level !== undefined) {
      const severity = String(req.body.min_severity_level).toUpperCase();
      if (!validSeverities.includes(severity)) {
        return sendError(next, 'Invalid min_severity_level', 400);
      }
      updates.min_severity_level = severity;
    }

    if (!Object.keys(updates).length) {
      return sendError(next, 'No preference fields provided', 400);
    }

    const where = {
      user_id: req.user.user_id,
      site_id: normalizedSite.value
    };

    const [preference] = await NotificationPreference.findOrCreate({ where, defaults: where });
    await preference.update(updates);

    return res.status(200).json({
      success: true,
      data: preference,
      message: 'Notification preferences updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

exports.upsertFcmToken = async (req, res, next) => {
  try {
    if (!req.user?.user_id) {
      return sendError(next, 'Unauthorized', 401);
    }

    const normalizedSite = normalizeOptionalSiteId(req.body.site_id);
    if (!normalizedSite.ok) {
      return sendError(next, 'Invalid site_id', 400);
    }

    const fcmToken = typeof req.body.fcm_token === 'string' ? req.body.fcm_token.trim() : '';
    if (!fcmToken) {
      return sendError(next, 'fcm_token is required', 400);
    }

    const where = {
      user_id: req.user.user_id,
      site_id: normalizedSite.value
    };

    const [preference] = await NotificationPreference.findOrCreate({ where, defaults: where });
    await preference.update({
      fcm_token: fcmToken,
      push_enabled: true
    });

    return res.status(200).json({
      success: true,
      data: {
        user_id: preference.user_id,
        site_id: preference.site_id,
        fcm_token: preference.fcm_token,
        updated_at: preference.updated_at
      },
      message: 'FCM token updated successfully'
    });
  } catch (error) {
    next(error);
  }
};
