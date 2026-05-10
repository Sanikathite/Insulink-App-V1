'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Device,
  Channel,
  AlarmLog,
  AlarmThreshold,
  AlarmSensorReading
} = require('../models');
const { sendError } = require('../functions/sendResponse');

const validFaultStates = ['NORMAL', 'UNDERCURRENT', 'OVERCURRENT'];

const parsePositiveInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeUnit = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const normalizeRole = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
};

const extractRoles = (user) => {
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

const resolveChannel = async ({ channelId, deviceId, channelNumber, transaction }) => {
  if (channelId) {
    return Channel.findByPk(channelId, { transaction });
  }

  if (!deviceId || !channelNumber) {
    return null;
  }

  return Channel.findOne({
    where: {
      device_id: deviceId,
      channel_number: channelNumber
    },
    transaction
  });
};

const buildAlarmMessage = ({ faultState, readingValue, unit, threshold, channel }) => {
  const label = channel?.label ? ` (${channel.label})` : '';
  const channelRef = channel?.channel_number ? `Channel ${channel.channel_number}` : 'Channel';
  const isUnder = faultState === 'UNDERCURRENT';
  const limit = isUnder ? threshold?.lower_limit : threshold?.upper_limit;
  const operator = isUnder ? '<' : '>';
  const kind = isUnder ? 'Undercurrent' : 'Overcurrent';

  return `${kind} on ${channelRef}${label}: ${readingValue} ${unit} ${operator} ${limit} ${unit}`;
};

exports.ensureAdminRole = (req, res, next) => {
  const roles = extractRoles(req.user);
//   if (!roles.includes('ADMIN')) {
//     return res.status(403).json({
//       success: false,
//       message: 'Only Admin role can manage alarm thresholds'
//     });
//   }

  return next();
};

exports.createReading = async (req, res, next) => {
  const deviceId = parsePositiveInt(req.body?.device_id, null);
  const channelId = parsePositiveInt(req.body?.channel_id, null);
  const channelNumber = parsePositiveInt(req.body?.channel_number, null);
  const readingValue = parseNumber(req.body?.reading_value);

  if (!channelId && (!deviceId || !channelNumber)) {
    return sendError(next, 'Provide channel_id or device_id with channel_number', 400);
  }

  if (readingValue === null) {
    return sendError(next, 'reading_value must be a valid number', 400);
  }

  const readingAt = parseDateOrNull(req.body?.reading_at) || new Date();
  const transaction = await sequelize.transaction();

  try {
    const channel = await resolveChannel({
      channelId,
      deviceId,
      channelNumber,
      transaction
    });

    if (!channel) {
      await transaction.rollback();
      return sendError(next, 'Channel not found', 404);
    }

    if (deviceId && channel.device_id !== deviceId) {
      await transaction.rollback();
      return sendError(next, 'device_id does not match channel_id', 400);
    }

    const threshold = await AlarmThreshold.findOne({
      where: { channel_id: channel.channel_id },
      transaction
    });

    const unit = normalizeUnit(req.body?.unit) || threshold?.unit || 'V';

    let faultState = 'NORMAL';
    if (threshold) {
      if (readingValue < threshold.lower_limit) {
        faultState = 'UNDERCURRENT';
      } else if (readingValue > threshold.upper_limit) {
        faultState = 'OVERCURRENT';
      }
    }

    const reading = await AlarmSensorReading.create(
      {
        device_id: channel.device_id,
        channel_id: channel.channel_id,
        threshold_id: threshold?.threshold_id || null,
        reading_value: readingValue,
        unit,
        reading_at: readingAt,
        fault_state: faultState
      },
      { transaction }
    );

    let alarmLog = null;
    if (faultState !== 'NORMAL') {
      alarmLog = await AlarmLog.create(
        {
          channel_id: channel.channel_id,
          reading_id: reading.reading_id,
          threshold_id: threshold?.threshold_id || null,
          fault_type: faultState,
          status: 'ACTIVE',
          severity: channel.priority || 'WARNING',
          fault_at: readingAt,
          alarm_message: buildAlarmMessage({
            faultState,
            readingValue,
            unit,
            threshold,
            channel
          })
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      data: {
        reading,
        alarm_log: alarmLog
      },
      message: alarmLog
        ? 'Reading recorded and alarm created'
        : 'Reading recorded successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.getReadings = async (req, res, next) => {
  try {
    const deviceId = parsePositiveInt(req.query.device_id, null);
    const channelId = parsePositiveInt(req.query.channel_id, null);
    const channelNumber = parsePositiveInt(req.query.channel_number, null);

    if (channelNumber && !deviceId && !channelId) {
      return sendError(next, 'device_id is required when filtering by channel_number', 400);
    }

    let resolvedChannelId = channelId;
    if (!resolvedChannelId && channelNumber) {
      const channel = await resolveChannel({
        deviceId,
        channelNumber,
        transaction: null
      });

      if (!channel) {
        return sendError(next, 'Channel not found', 404);
      }

      resolvedChannelId = channel.channel_id;
    }

    const fromDate = parseDateOrNull(req.query.from_date || req.query.start_date);
    const toDate = parseDateOrNull(req.query.to_date || req.query.end_date);

    if ((req.query.from_date || req.query.start_date) && !fromDate) {
      return sendError(next, 'Invalid from_date filter', 400);
    }

    if ((req.query.to_date || req.query.end_date) && !toDate) {
      return sendError(next, 'Invalid to_date filter', 400);
    }

    if (fromDate && toDate && fromDate > toDate) {
      return sendError(next, 'from_date cannot be greater than to_date', 400);
    }

    const faultState = req.query.fault_state
      ? String(req.query.fault_state).toUpperCase()
      : null;
    if (faultState && !validFaultStates.includes(faultState)) {
      return sendError(next, 'Invalid fault_state filter', 400);
    }

    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, 100);
    const limit = Math.min(requestedLimit, 500);
    const offset = (page - 1) * limit;

    const where = {};
    if (deviceId) where.device_id = deviceId;
    if (resolvedChannelId) where.channel_id = resolvedChannelId;
    if (faultState) where.fault_state = faultState;

    if (fromDate || toDate) {
      where.reading_at = {};
      if (fromDate) where.reading_at[Op.gte] = fromDate;
      if (toDate) where.reading_at[Op.lte] = toDate;
    }

    const { rows, count } = await AlarmSensorReading.findAndCountAll({
      where,
      include: [
        {
          model: Channel,
          as: 'channel',
          attributes: ['channel_id', 'channel_number', 'label', 'device_id'],
          required: true,
          include: [
            {
              model: Device,
              as: 'device',
              attributes: ['device_id', 'device_name', 'hardware_uid'],
              required: false
            }
          ]
        }
      ],
      order: [['reading_at', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      success: true,
      data: {
        filters: {
          device_id: deviceId,
          channel_id: resolvedChannelId,
          channel_number: channelNumber,
          fault_state: faultState,
          from_date: fromDate ? fromDate.toISOString() : null,
          to_date: toDate ? toDate.toISOString() : null
        },
        pagination: {
          page,
          limit,
          total_records: count,
          total_pages: Math.ceil(count / limit) || 1
        },
        readings: rows
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getThresholds = async (req, res, next) => {
  try {
    const deviceId = parsePositiveInt(req.query.device_id, null);
    const channelId = parsePositiveInt(req.query.channel_id, null);
    const channelNumber = parsePositiveInt(req.query.channel_number, null);

    if (channelNumber && !deviceId && !channelId) {
      return sendError(next, 'device_id is required when filtering by channel_number', 400);
    }

    const where = {};
    if (channelId) where.channel_id = channelId;

    const channelWhere = {};
    if (deviceId) channelWhere.device_id = deviceId;
    if (channelNumber) channelWhere.channel_number = channelNumber;

    const thresholds = await AlarmThreshold.findAll({
      where,
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
              attributes: ['device_id', 'device_name', 'hardware_uid'],
              required: false
            }
          ]
        }
      ],
      order: [[{ model: Channel, as: 'channel' }, 'channel_number', 'ASC']]
    });

    return res.status(200).json({
      success: true,
      data: thresholds
    });
  } catch (error) {
    next(error);
  }
};

exports.upsertThreshold = async (req, res, next) => {
  const deviceId = parsePositiveInt(req.body?.device_id, null);
  const channelId = parsePositiveInt(req.body?.channel_id, null);
  const channelNumber = parsePositiveInt(req.body?.channel_number, null);
  const lowerLimit = parseNumber(req.body?.lower_limit);
  const upperLimit = parseNumber(req.body?.upper_limit);

  if (!channelId && (!deviceId || !channelNumber)) {
    return sendError(next, 'Provide channel_id or device_id with channel_number', 400);
  }

  if (lowerLimit === null || upperLimit === null) {
    return sendError(next, 'lower_limit and upper_limit must be valid numbers', 400);
  }

  if (lowerLimit >= upperLimit) {
    return sendError(next, 'lower_limit must be less than upper_limit', 400);
  }

  const unit = normalizeUnit(req.body?.unit) || 'V';
  const transaction = await sequelize.transaction();

  try {
    const channel = await resolveChannel({
      channelId,
      deviceId,
      channelNumber,
      transaction
    });

    if (!channel) {
      await transaction.rollback();
      return sendError(next, 'Channel not found', 404);
    }

    if (deviceId && channel.device_id !== deviceId) {
      await transaction.rollback();
      return sendError(next, 'device_id does not match channel_id', 400);
    }

    const actor = req.user?.name || String(req.user?.user_id || 'SYSTEM');

    let threshold = await AlarmThreshold.findOne({
      where: { channel_id: channel.channel_id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (threshold) {
      await threshold.update(
        {
          lower_limit: lowerLimit,
          upper_limit: upperLimit,
          unit,
          updated_by: actor
        },
        { transaction }
      );
    } else {
      threshold = await AlarmThreshold.create(
        {
          channel_id: channel.channel_id,
          lower_limit: lowerLimit,
          upper_limit: upperLimit,
          unit,
          created_by: actor
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: threshold,
      message: 'Threshold saved successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
