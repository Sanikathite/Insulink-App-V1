'use strict';

const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const {
  sequelize,
  Device,
  Site,
  AlarmLog,
  Channel,
  User,
  AlarmAction,
  SystemHealthLog
} = require('../models');
const { sendError } = require('../functions/sendResponse');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const validStatuses = ['ACTIVE', 'ACKNOWLEDGED', 'CLEARED', 'RESET'];
const validSeverities = ['CRITICAL', 'WARNING', 'INFO'];
const validActionTypes = ['ACKNOWLEDGE', 'RESET', 'MUTE', 'TEST'];
const allowedAlarmActionRoles = new Set(['ADMIN', 'OPERATOR']);

const normalizeRole = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
};

const extractUserRoles = (user) => {
  if (!user || typeof user !== 'object') return [];

  const roles = new Set();
  const roleSources = [
    user.role,
    user.role_name,
    user.roleName,
    user.user_role,
    user.userRole,
    user.user_type,
    user.userType,
    user.access_role,
    user.accessRole,
    user.designation,
    user.group
  ];

  roleSources.forEach((entry) => {
    if (typeof entry === 'string') {
      const normalized = normalizeRole(entry);
      if (normalized) roles.add(normalized);
      return;
    }

    if (entry && typeof entry === 'object') {
      ['name', 'role', 'role_name', 'roleName', 'key', 'code', 'type'].forEach((key) => {
        const normalized = normalizeRole(entry[key]);
        if (normalized) roles.add(normalized);
      });
    }
  });

  return Array.from(roles);
};

const ensureAlarmActionRole = (req, next) => {
  if (!req.user) {
    sendError(next, 'Unauthorized access', 401);
    return false;
  }

  const roles = extractUserRoles(req.user);
  if (roles.includes('VIEWER')) {
    sendError(next, 'Viewers are not allowed to perform alarm actions', 403);
    return false;
  }

  if (!roles.some((role) => allowedAlarmActionRoles.has(role))) {
    sendError(next, 'Only Admin and Operator roles can perform alarm actions', 403);
    return false;
  }

  return true;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString();
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const stringified = String(value).replace(/"/g, '""');
  return `"${stringified}"`;
};

const buildAlarmStateSnapshot = (alarm) => ({
  status: alarm.status,
  acknowledged_at: formatDateTime(alarm.acknowledged_at),
  acknowledged_by: alarm.acknowledged_by,
  reset_at: formatDateTime(alarm.reset_at),
  reset_by: alarm.reset_by,
  hooter_muted_at: formatDateTime(alarm.hooter_muted_at),
  last_tested_at: formatDateTime(alarm.last_tested_at)
});

const buildActionDiff = (beforeState, afterState) => {
  const diff = {};
  const allKeys = new Set([
    ...Object.keys(beforeState || {}),
    ...Object.keys(afterState || {})
  ]);

  allKeys.forEach((key) => {
    const fromValue = beforeState ? beforeState[key] : null;
    const toValue = afterState ? afterState[key] : null;
    if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
      diff[key] = { from: fromValue, to: toValue };
    }
  });

  return diff;
};

const buildTargetEntity = (alarm) => ({
  entity: 'alarm_log',
  alarm_id: alarm.alarm_id,
  channel_id: alarm.channel_id || alarm.channel?.channel_id || null,
  device_id: alarm.channel?.device_id || alarm.channel?.device?.device_id || null,
  site_id: alarm.channel?.device?.site_id || alarm.channel?.device?.site?.site_id || null
});

const getRequestIp = (req) => {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim().slice(0, 45);
  }

  if (typeof req.ip === 'string') {
    return req.ip.slice(0, 45);
  }

  return null;
};

const extractActionMeta = (req) => {
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim() : null;
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : 'MOBILE_APP';

  return {
    remarks: remarks ? remarks.slice(0, 255) : null,
    source: source ? source.slice(0, 100) : 'MOBILE_APP'
  };
};

const alarmInclude = [
  {
    model: Channel,
    as: 'channel',
    attributes: ['channel_id', 'channel_number', 'label', 'priority', 'input_type', 'device_id'],
    include: [
      {
        model: Device,
        as: 'device',
        attributes: ['device_id', 'device_name', 'hardware_uid', 'connection_status', 'last_heartbeat', 'site_id'],
        include: [
          {
            model: Site,
            as: 'site',
            attributes: ['site_id', 'site_name', 'location']
          }
        ]
      }
    ],
    required: true
  },
  {
    model: User,
    as: 'ack_user',
    attributes: ['user_id', 'name'],
    required: false
  },
  {
    model: User,
    as: 'reset_user',
    attributes: ['user_id', 'name'],
    required: false
  }
];

const loadAlarmWithContext = async (alarmId, transaction = null) => {
  return AlarmLog.findByPk(alarmId, {
    include: alarmInclude,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
};

const buildHistoryQueryParts = (req) => {
  const page = parsePositiveInt(req.query.page, 1);
  const requestedLimit = parsePositiveInt(req.query.limit, 50);
  const limit = Math.min(requestedLimit, 200);
  const offset = (page - 1) * limit;

  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  const severity = req.query.severity ? String(req.query.severity).toUpperCase() : null;
  const alarmType = req.query.alarm_type ? String(req.query.alarm_type).trim().toUpperCase() : null;
  const search = req.query.search ? String(req.query.search).trim() : '';
  const fromDate = parseDateOrNull(req.query.from_date || req.query.start_date);
  const toDate = parseDateOrNull(req.query.to_date || req.query.end_date);
  const siteId = req.query.site_id ? parsePositiveInt(req.query.site_id, null) : null;
  const deviceId = req.query.device_id ? parsePositiveInt(req.query.device_id, null) : null;

  if (status && !validStatuses.includes(status)) {
    return { error: { message: 'Invalid status filter', status: 400 } };
  }

  if (severity && !validSeverities.includes(severity)) {
    return { error: { message: 'Invalid severity filter', status: 400 } };
  }

  if ((req.query.from_date || req.query.start_date) && !fromDate) {
    return { error: { message: 'Invalid from_date filter', status: 400 } };
  }

  if ((req.query.to_date || req.query.end_date) && !toDate) {
    return { error: { message: 'Invalid to_date filter', status: 400 } };
  }

  if (fromDate && toDate && fromDate > toDate) {
    return { error: { message: 'from_date cannot be greater than to_date', status: 400 } };
  }

  if (req.query.site_id && !siteId) {
    return { error: { message: 'Invalid site_id filter', status: 400 } };
  }

  if (req.query.device_id && !deviceId) {
    return { error: { message: 'Invalid device_id filter', status: 400 } };
  }

  const where = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;

  if (fromDate || toDate) {
    where.fault_at = {};
    if (fromDate) where.fault_at[Op.gte] = fromDate;
    if (toDate) where.fault_at[Op.lte] = toDate;
  }

  const channelWhere = {};
  const deviceWhere = {};

  if (deviceId) {
    channelWhere.device_id = deviceId;
  }

  if (alarmType) {
    channelWhere.input_type = alarmType;
  }

  if (siteId) {
    deviceWhere.site_id = siteId;
  }

  if (search) {
    const maybeChannelNo = Number.parseInt(search, 10);

    const searchConditions = [
      { alarm_message: { [Op.like]: `%${search}%` } },
      { '$channel.label$': { [Op.like]: `%${search}%` } }
    ];

    if (!Number.isNaN(maybeChannelNo)) {
      searchConditions.push({ '$channel.channel_number$': maybeChannelNo });
    }

    where[Op.or] = searchConditions;
  }

  const include = [
    {
      model: Channel,
      as: 'channel',
      attributes: ['channel_id', 'channel_number', 'label', 'priority', 'input_type', 'device_id'],
      where: Object.keys(channelWhere).length ? channelWhere : undefined,
      required: true,
      include: [
        {
          model: Device,
          as: 'device',
          attributes: ['device_id', 'device_name', 'hardware_uid', 'connection_status', 'last_heartbeat', 'site_id'],
          where: Object.keys(deviceWhere).length ? deviceWhere : undefined,
          required: true,
          include: [
            {
              model: Site,
              as: 'site',
              attributes: ['site_id', 'site_name', 'location'],
              required: false
            }
          ]
        }
      ]
    },
    {
      model: User,
      as: 'ack_user',
      attributes: ['user_id', 'name'],
      required: false
    },
    {
      model: User,
      as: 'reset_user',
      attributes: ['user_id', 'name'],
      required: false
    }
  ];

  return {
    page,
    limit,
    offset,
    where,
    include,
    filters: {
      status,
      severity,
      alarm_type: alarmType,
      search,
      from_date: fromDate ? fromDate.toISOString() : null,
      to_date: toDate ? toDate.toISOString() : null,
      site_id: siteId,
      device_id: deviceId
    }
  };
};

const createAlarmAction = async ({
  alarm,
  userId,
  actionType,
  metadata,
  beforeState,
  afterState,
  req,
  transaction
}) => {
  return AlarmAction.create(
    {
      alarm_log_id: alarm.alarm_id,
      user_id: userId,
      action_type: actionType,
      target_entity: buildTargetEntity(alarm),
      diff_payload: buildActionDiff(beforeState, afterState),
      remarks: metadata.remarks,
      source: metadata.source,
      ip_address: getRequestIp(req),
      user_agent:
        typeof req.headers?.['user-agent'] === 'string'
          ? req.headers['user-agent'].slice(0, 255)
          : null,
      performed_at: new Date()
    },
    { transaction }
  );
};

exports.getDevices = async (req, res, next) => {
  try {
    const devices = await Device.findAll({
      attributes: [
        'device_id',
        'device_name',
        'hardware_uid',
        'connection_status',
        'last_heartbeat',
        'site_id'
      ],
      include: [
        {
          model: Site,
          as: 'site',
          attributes: ['site_id', 'site_name', 'location']
        }
      ],
      order: [['device_name', 'ASC']]
    });

    res.locals.data = devices;
    next();
  } catch (error) {
    next(error);
  }
};

exports.getDeviceAlarms = async (req, res, next) => {
  try {
    const deviceId = parsePositiveInt(req.query.device_id, null);
    if (!deviceId) {
      return sendError(next, 'Valid device_id query parameter is required', 400);
    }

    const status = req.query.status ? req.query.status.toUpperCase() : null;
    const severity = req.query.severity ? req.query.severity.toUpperCase() : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 50);
    const offset = (page - 1) * limit;

    if (status && !validStatuses.includes(status)) {
      return sendError(next, 'Invalid status filter', 400);
    }

    if (severity && !validSeverities.includes(severity)) {
      return sendError(next, 'Invalid severity filter', 400);
    }

    const device = await Device.findByPk(deviceId, {
      attributes: [
        'device_id',
        'device_name',
        'hardware_uid',
        'connection_status',
        'last_heartbeat'
      ],
      include: [
        {
          model: Site,
          as: 'site',
          attributes: ['site_id', 'site_name', 'location']
        }
      ]
    });

    if (!device) {
      return sendError(next, 'Device not found', 404);
    }

    const where = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const channelWhere = { device_id: deviceId };
    if (search) {
      channelWhere[Op.or] = [
        { label: { [Op.like]: `%${search}%` } },
        { channel_number: Number.parseInt(search, 10) || -1 }
      ];
    }

    const include = [
      {
        model: Channel,
        as: 'channel',
        attributes: ['channel_id', 'channel_number', 'label', 'priority', 'input_type'],
        where: channelWhere,
        required: true
      },
      {
        model: User,
        as: 'ack_user',
        attributes: ['user_id', 'name'],
        required: false
      },
      {
        model: User,
        as: 'reset_user',
        attributes: ['user_id', 'name'],
        required: false
      }
    ];

    const { rows, count } = await AlarmLog.findAndCountAll({
      where,
      include,
      order: [['fault_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    const [activeCount, acknowledgedCount, clearedCount, resetCount] = await Promise.all([
      AlarmLog.count({
        where: { status: 'ACTIVE' },
        include: [
          {
            model: Channel,
            as: 'channel',
            where: { device_id: deviceId },
            required: true
          }
        ]
      }),
      AlarmLog.count({
        where: { status: 'ACKNOWLEDGED' },
        include: [
          {
            model: Channel,
            as: 'channel',
            where: { device_id: deviceId },
            required: true
          }
        ]
      }),
      AlarmLog.count({
        where: { status: 'CLEARED' },
        include: [
          {
            model: Channel,
            as: 'channel',
            where: { device_id: deviceId },
            required: true
          }
        ]
      }),
      AlarmLog.count({
        where: { status: 'RESET' },
        include: [
          {
            model: Channel,
            as: 'channel',
            where: { device_id: deviceId },
            required: true
          }
        ]
      })
    ]);

    res.locals.data = {
      device,
      filters: {
        status,
        severity,
        search
      },
      summary: {
        total: count,
        active: activeCount,
        acknowledged: acknowledgedCount,
        cleared: clearedCount,
        reset: resetCount
      },
      pagination: {
        page,
        limit,
        total_records: count,
        total_pages: Math.ceil(count / limit) || 1
      },
      alarms: rows
    };

    next();
  } catch (error) {
    next(error);
  }
};

exports.getLiveAlarmStatus = async (req, res, next) => {
  try {
    const deviceId = parsePositiveInt(req.query.device_id, null);
    if (!deviceId) {
      return sendError(next, 'Valid device_id query parameter is required', 400);
    }

    const device = await Device.findByPk(deviceId, {
      attributes: ['device_id', 'device_name', 'hardware_uid', 'connection_status', 'last_heartbeat', 'site_id'],
      include: [
        {
          model: Site,
          as: 'site',
          attributes: ['site_id', 'site_name', 'location'],
          required: false
        }
      ]
    });

    if (!device) {
      return sendError(next, 'Device not found', 404);
    }

    const channels = await Channel.findAll({
      where: { device_id: deviceId },
      attributes: ['channel_id', 'channel_number', 'label', 'priority', 'input_type'],
      order: [['channel_number', 'ASC']]
    });

    const channelIds = channels.map((channel) => channel.channel_id);

    let latestByChannelId = new Map();
    if (channelIds.length) {
      const alarmRows = await AlarmLog.findAll({
        where: {
          channel_id: { [Op.in]: channelIds }
        },
        attributes: [
          'alarm_id',
          'channel_id',
          'status',
          'severity',
          'fault_at',
          'acknowledged_at',
          'cleared_at',
          'reset_at',
          'alarm_message'
        ],
        order: [
          ['channel_id', 'ASC'],
          ['fault_at', 'DESC'],
          ['alarm_id', 'DESC']
        ]
      });

      latestByChannelId = alarmRows.reduce((acc, alarm) => {
        if (!acc.has(alarm.channel_id)) {
          acc.set(alarm.channel_id, alarm);
        }
        return acc;
      }, new Map());
    }

    const liveBuckets = {
      Active: [],
      'Acknowledged/Pending': [],
      Cleared: []
    };

    channels.forEach((channel) => {
      const latestAlarm = latestByChannelId.get(channel.channel_id);

      const row = {
        channel_id: channel.channel_id,
        channel_number: channel.channel_number,
        channel_label: channel.label,
        channel_priority: channel.priority,
        input_type: channel.input_type,
        alarm_id: latestAlarm?.alarm_id || null,
        status: latestAlarm?.status || 'CLEARED',
        severity: latestAlarm?.severity || channel.priority,
        fault_at: latestAlarm?.fault_at || null,
        acknowledged_at: latestAlarm?.acknowledged_at || null,
        cleared_at: latestAlarm?.cleared_at || null,
        reset_at: latestAlarm?.reset_at || null,
        alarm_message: latestAlarm?.alarm_message || null
      };

      if (row.status === 'ACTIVE') {
        liveBuckets.Active.push(row);
        return;
      }

      if (row.status === 'ACKNOWLEDGED' || row.status === 'RESET') {
        liveBuckets['Acknowledged/Pending'].push(row);
        return;
      }

      liveBuckets.Cleared.push(row);
    });

    return res.status(200).json({
      success: true,
      data: {
        device,
        Active: liveBuckets.Active,
        'Acknowledged/Pending': liveBuckets['Acknowledged/Pending'],
        Cleared: liveBuckets.Cleared,
        summary: {
          total_channels: channels.length,
          active: liveBuckets.Active.length,
          acknowledged_pending: liveBuckets['Acknowledged/Pending'].length,
          cleared: liveBuckets.Cleared.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.acknowledgeAlarm = async (req, res, next) => {
  if (!ensureAlarmActionRole(req, next)) {
    return;
  }

  const alarmId = parsePositiveInt(req.params.alarm_id, null);
  if (!alarmId) {
    return sendError(next, 'Invalid alarm_id', 400);
  }

  const transaction = await sequelize.transaction();

  try {
    const alarm = await loadAlarmWithContext(alarmId, transaction);

    if (!alarm) {
      await transaction.rollback();
      return sendError(next, 'Alarm not found', 404);
    }

    if (alarm.status === 'ACKNOWLEDGED') {
      await transaction.commit();
      const current = await loadAlarmWithContext(alarmId);
      return res.status(200).json({
        success: true,
        data: { alarm: current },
        message: 'Alarm already acknowledged'
      });
    }

    if (alarm.status !== 'ACTIVE') {
      await transaction.rollback();
      return sendError(next, 'Only ACTIVE alarms can be acknowledged', 409);
    }

    const metadata = extractActionMeta(req);
    const beforeState = buildAlarmStateSnapshot(alarm);

    await alarm.update(
      {
        status: 'ACKNOWLEDGED',
        acknowledged_at: new Date(),
        acknowledged_by: req.user.user_id
      },
      { transaction }
    );

    const afterState = buildAlarmStateSnapshot(alarm);

    await createAlarmAction({
      alarm,
      userId: req.user.user_id,
      actionType: 'ACKNOWLEDGE',
      metadata,
      beforeState,
      afterState,
      req,
      transaction
    });

    await transaction.commit();

    const updatedAlarm = await loadAlarmWithContext(alarmId);

    return res.status(200).json({
      success: true,
      data: { alarm: updatedAlarm },
      message: 'Alarm acknowledged successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.muteAlarm = async (req, res, next) => {
  if (!ensureAlarmActionRole(req, next)) {
    return;
  }

  const alarmId = parsePositiveInt(req.params.alarm_id, null);
  if (!alarmId) {
    return sendError(next, 'Invalid alarm_id', 400);
  }

  const transaction = await sequelize.transaction();

  try {
    const alarm = await loadAlarmWithContext(alarmId, transaction);

    if (!alarm) {
      await transaction.rollback();
      return sendError(next, 'Alarm not found', 404);
    }

    if (alarm.status === 'RESET') {
      await transaction.rollback();
      return sendError(next, 'Muted action is not allowed for RESET alarms', 409);
    }

    const deviceId = alarm.channel?.device_id || alarm.channel?.device?.device_id;
    if (!deviceId) {
      await transaction.rollback();
      return sendError(next, 'Unable to scope mute to device hooter', 409);
    }

    // Mute is tied to the per-device hooter, so guard repeated calls on the same device.
    const tenSecondsAgo = new Date(Date.now() - 10000);
    const recentMute = await AlarmAction.findOne({
      where: {
        action_type: 'MUTE',
        user_id: req.user.user_id,
        performed_at: { [Op.gte]: tenSecondsAgo }
      },
      include: [
        {
          model: AlarmLog,
          as: 'alarm_event',
          required: true,
          attributes: ['alarm_id'],
          include: [
            {
              model: Channel,
              as: 'channel',
              required: true,
              attributes: ['channel_id', 'device_id'],
              where: { device_id: deviceId }
            }
          ]
        }
      ],
      order: [['performed_at', 'DESC']],
      transaction
    });

    const metadata = extractActionMeta(req);
    const beforeState = buildAlarmStateSnapshot(alarm);

    if (!recentMute) {
      const muteUpdate = { hooter_muted_at: new Date() };
      if (alarm.status === 'ACTIVE') {
        muteUpdate.status = 'ACKNOWLEDGED';
        muteUpdate.acknowledged_at = new Date();
        muteUpdate.acknowledged_by = req.user.user_id;
      }

      await alarm.update(muteUpdate, { transaction });

      const afterState = buildAlarmStateSnapshot(alarm);

      await createAlarmAction({
        alarm,
        userId: req.user.user_id,
        actionType: 'MUTE',
        metadata,
        beforeState,
        afterState,
        req,
        transaction
      });
    }

    await transaction.commit();

    const updatedAlarm = await loadAlarmWithContext(alarmId);

    return res.status(200).json({
      success: true,
      data: { alarm: updatedAlarm },
      message: recentMute
        ? 'Duplicate mute ignored (already processed recently)'
        : 'Alarm muted at device-hooter scope and action recorded successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.resetAlarm = async (req, res, next) => {
  if (!ensureAlarmActionRole(req, next)) {
    return;
  }

  const alarmId = parsePositiveInt(req.params.alarm_id, null);
  if (!alarmId) {
    return sendError(next, 'Invalid alarm_id', 400);
  }

  const transaction = await sequelize.transaction();

  try {
    const alarm = await loadAlarmWithContext(alarmId, transaction);

    if (!alarm) {
      await transaction.rollback();
      return sendError(next, 'Alarm not found', 404);
    }

    if (alarm.status === 'RESET') {
      await transaction.commit();
      const current = await loadAlarmWithContext(alarmId);
      return res.status(200).json({
        success: true,
        data: { alarm: current },
        message: 'Alarm is already in RESET state'
      });
    }

    if (alarm.status === 'ACTIVE') {
      await transaction.rollback();
      return sendError(next, 'ACTIVE alarms must be acknowledged before reset', 409);
    }

    const metadata = extractActionMeta(req);
    const beforeState = buildAlarmStateSnapshot(alarm);

    await alarm.update(
      {
        status: 'RESET',
        reset_at: new Date(),
        reset_by: req.user.user_id
      },
      { transaction }
    );

    const afterState = buildAlarmStateSnapshot(alarm);

    await createAlarmAction({
      alarm,
      userId: req.user.user_id,
      actionType: 'RESET',
      metadata,
      beforeState,
      afterState,
      req,
      transaction
    });

    await transaction.commit();

    const updatedAlarm = await loadAlarmWithContext(alarmId);

    return res.status(200).json({
      success: true,
      data: { alarm: updatedAlarm },
      message: 'Alarm reset successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.testAlarm = async (req, res, next) => {
  if (!ensureAlarmActionRole(req, next)) {
    return;
  }

  const alarmId = parsePositiveInt(req.params.alarm_id, null);
  if (!alarmId) {
    return sendError(next, 'Invalid alarm_id', 400);
  }

  const transaction = await sequelize.transaction();

  try {
    const alarm = await loadAlarmWithContext(alarmId, transaction);

    if (!alarm) {
      await transaction.rollback();
      return sendError(next, 'Alarm not found', 404);
    }

    const metadata = extractActionMeta(req);
    const beforeState = buildAlarmStateSnapshot(alarm);

    await alarm.update(
      {
        last_tested_at: new Date()
      },
      { transaction }
    );

    const afterState = buildAlarmStateSnapshot(alarm);

    await createAlarmAction({
      alarm,
      userId: req.user.user_id,
      actionType: 'TEST',
      metadata,
      beforeState,
      afterState,
      req,
      transaction
    });

    await transaction.commit();

    const current = await loadAlarmWithContext(alarmId);

    return res.status(200).json({
      success: true,
      data: { alarm: current },
      message: 'Alarm test action recorded successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.getAlarmHistory = async (req, res, next) => {
  try {
    const queryParts = buildHistoryQueryParts(req);
    if (queryParts.error) {
      return sendError(next, queryParts.error.message, queryParts.error.status);
    }

    const { where, include, page, limit, offset, filters } = queryParts;

    const { rows, count } = await AlarmLog.findAndCountAll({
      where,
      include,
      order: [['fault_at', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false
    });

    return res.status(200).json({
      success: true,
      data: {
        filters,
        pagination: {
          page,
          limit,
          total_records: count,
          total_pages: Math.ceil(count / limit) || 1
        },
        records: rows
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.exportAlarmHistory = async (req, res, next) => {
  try {
    const format = req.query.format ? String(req.query.format).toLowerCase() : '';
    if (!['csv', 'pdf'].includes(format)) {
      return sendError(next, 'Invalid format. Supported values are csv or pdf', 400);
    }

    const queryParts = buildHistoryQueryParts(req);
    if (queryParts.error) {
      return sendError(next, queryParts.error.message, queryParts.error.status);
    }

    const { where, include, filters } = queryParts;

    const rows = await AlarmLog.findAll({
      where,
      include,
      order: [['fault_at', 'DESC']],
      limit: 5000,
      subQuery: false
    });

    const exportRows = rows.map((alarm) => ({
      alarm_id: alarm.alarm_id,
      status: alarm.status,
      severity: alarm.severity,
      fault_at: formatDateTime(alarm.fault_at),
      acknowledged_at: formatDateTime(alarm.acknowledged_at),
      cleared_at: formatDateTime(alarm.cleared_at),
      reset_at: formatDateTime(alarm.reset_at),
      alarm_message: alarm.alarm_message || '',
      channel_number: alarm.channel?.channel_number || '',
      channel_label: alarm.channel?.label || '',
      device_name: alarm.channel?.device?.device_name || '',
      site_name: alarm.channel?.device?.site?.site_name || '',
      acknowledged_by: alarm.ack_user?.name || '',
      reset_by: alarm.reset_user?.name || ''
    }));

    if (format === 'csv') {
      const headers = [
        'alarm_id',
        'status',
        'severity',
        'fault_at',
        'acknowledged_at',
        'cleared_at',
        'reset_at',
        'alarm_message',
        'channel_number',
        'channel_label',
        'device_name',
        'site_name',
        'acknowledged_by',
        'reset_by'
      ];

      const lines = [headers.map(escapeCsv).join(',')];
      exportRows.forEach((row) => {
        lines.push(headers.map((header) => escapeCsv(row[header])).join(','));
      });

      const fileName = `alarm-history-${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.status(200).send(lines.join('\n'));
    }

    const fileName = `alarm-history-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('Alarm History Export', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated At: ${new Date().toISOString()}`);
    doc.text(`Filters: ${JSON.stringify(filters)}`);
    doc.moveDown(0.75);

    exportRows.forEach((row, index) => {
      const line = [
        `${index + 1}.`,
        `Alarm# ${row.alarm_id}`,
        row.status,
        row.severity,
        `${row.site_name}/${row.device_name}`,
        `CH-${row.channel_number} ${row.channel_label}`,
        row.fault_at
      ].join(' | ');

      doc.fontSize(9).text(line);

      if (row.alarm_message) {
        doc.fontSize(8).fillColor('#333333').text(`Message: ${row.alarm_message}`);
        doc.fillColor('#000000');
      }

      doc.moveDown(0.35);
    });

    doc.end();
  } catch (error) {
    next(error);
  }
};

exports.getAlarmAuditTrail = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 50);
    const limit = Math.min(requestedLimit, 200);
    const offset = (page - 1) * limit;

    const actionType = req.query.action_type ? String(req.query.action_type).toUpperCase() : null;
    const userId = req.query.user_id ? parsePositiveInt(req.query.user_id, null) : null;
    const siteId = req.query.site_id ? parsePositiveInt(req.query.site_id, null) : null;
    const deviceId = req.query.device_id ? parsePositiveInt(req.query.device_id, null) : null;
    const fromDate = parseDateOrNull(req.query.from_date || req.query.start_date);
    const toDate = parseDateOrNull(req.query.to_date || req.query.end_date);

    if (actionType && !validActionTypes.includes(actionType)) {
      return sendError(next, 'Invalid action_type filter', 400);
    }

    if (req.query.user_id && !userId) {
      return sendError(next, 'Invalid user_id filter', 400);
    }

    if (req.query.site_id && !siteId) {
      return sendError(next, 'Invalid site_id filter', 400);
    }

    if (req.query.device_id && !deviceId) {
      return sendError(next, 'Invalid device_id filter', 400);
    }

    if ((req.query.from_date || req.query.start_date) && !fromDate) {
      return sendError(next, 'Invalid from_date filter', 400);
    }

    if ((req.query.to_date || req.query.end_date) && !toDate) {
      return sendError(next, 'Invalid to_date filter', 400);
    }

    if (fromDate && toDate && fromDate > toDate) {
      return sendError(next, 'from_date cannot be greater than to_date', 400);
    }

    const where = {};
    if (actionType) where.action_type = actionType;
    if (userId) where.user_id = userId;
    if (fromDate || toDate) {
      where.performed_at = {};
      if (fromDate) where.performed_at[Op.gte] = fromDate;
      if (toDate) where.performed_at[Op.lte] = toDate;
    }

    const channelWhere = {};
    const deviceWhere = {};
    if (deviceId) channelWhere.device_id = deviceId;
    if (siteId) deviceWhere.site_id = siteId;

    const include = [
      {
        model: User,
        as: 'operator',
        attributes: ['user_id', 'name'],
        required: false
      },
      {
        model: AlarmLog,
        as: 'alarm_event',
        attributes: ['alarm_id', 'status', 'severity', 'fault_at'],
        required: true,
        include: [
          {
            model: Channel,
            as: 'channel',
            attributes: ['channel_id', 'channel_number', 'label', 'device_id'],
            where: Object.keys(channelWhere).length ? channelWhere : undefined,
            required: true,
            include: [
              {
                model: Device,
                as: 'device',
                attributes: ['device_id', 'device_name', 'site_id'],
                where: Object.keys(deviceWhere).length ? deviceWhere : undefined,
                required: true,
                include: [
                  {
                    model: Site,
                    as: 'site',
                    attributes: ['site_id', 'site_name'],
                    required: false
                  }
                ]
              }
            ]
          }
        ]
      }
    ];

    const { rows, count } = await AlarmAction.findAndCountAll({
      where,
      include,
      order: [['performed_at', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false
    });

    const records = rows.map((action) => {
      const alarmEvent = action.alarm_event;
      const channel = alarmEvent?.channel;
      const device = channel?.device;
      const site = device?.site;

      return {
        timestamp: action.performed_at,
        user_id: action.user_id,
        user_name: action.operator?.name || null,
        action_type: action.action_type,
        target_entity: action.target_entity || {
          entity: 'alarm_log',
          alarm_id: action.alarm_log_id,
          channel_id: channel?.channel_id || null,
          device_id: device?.device_id || null,
          site_id: site?.site_id || null
        },
        diff: action.diff_payload || null,
        remarks: action.remarks || null,
        source: action.source || null
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        filters: {
          action_type: actionType,
          user_id: userId,
          site_id: siteId,
          device_id: deviceId,
          from_date: fromDate ? fromDate.toISOString() : null,
          to_date: toDate ? toDate.toISOString() : null
        },
        pagination: {
          page,
          limit,
          total_records: count,
          total_pages: Math.ceil(count / limit) || 1
        },
        records
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getDeviceHealthSnapshot = async (req, res, next) => {
  try {
    const deviceId = req.query.device_id ? parsePositiveInt(req.query.device_id, null) : null;
    if (req.query.device_id && !deviceId) {
      return sendError(next, 'Invalid device_id filter', 400);
    }

    const deviceWhere = {};
    if (deviceId) deviceWhere.device_id = deviceId;

    const devices = await Device.findAll({
      where: deviceWhere,
      attributes: [
        'device_id',
        'device_name',
        'hardware_uid',
        'connection_status',
        'last_heartbeat',
        'power_source',
        'battery_percentage',
        'site_id'
      ],
      include: [
        {
          model: Site,
          as: 'site',
          attributes: ['site_id', 'site_name', 'location'],
          required: false
        }
      ],
      order: [['device_name', 'ASC']]
    });

    const snapshots = await Promise.all(
      devices.map(async (device) => {
        const health = await SystemHealthLog.findOne({
          where: { device_id: device.device_id },
          order: [['timestamp', 'DESC']]
        });

        return {
          device,
          latest_health: health,
          health_status: {
            connection_status: device.connection_status,
            last_heartbeat: device.last_heartbeat,
            heartbeat_health:
              device.last_heartbeat && Date.now() - new Date(device.last_heartbeat).getTime() <= 120000
                ? 'HEALTHY'
                : 'STALE',
            battery_percentage: health?.battery_percentage ?? device.battery_percentage ?? null,
            power_source: health?.power_source ?? device.power_source ?? null,
            signal_strength: health?.signal_strength ?? null,
            is_online: device.connection_status === 'ONLINE'
          }
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: snapshots
    });
  } catch (error) {
    next(error);
  }
};