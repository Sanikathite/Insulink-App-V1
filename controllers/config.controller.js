'use strict';

const { Channel, Device, SystemConfig } = require('../models');
const { sequelize } = require('../models');
const { sendError } = require('../functions/sendResponse');

const validPriorities = ['CRITICAL', 'WARNING', 'INFO'];

const parsePositiveInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
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
      ['name', 'role', 'key', 'code', 'type'].forEach((key) => {
        const normalized = normalizeRole(entry[key]);
        if (normalized) roles.add(normalized);
      });
    }
  });

  return Array.from(roles);
};

exports.ensureAdminRole = (req, res, next) => {
  const roles = extractRoles(req.user);
  if (!roles.includes('ADMIN')) {
    return res.status(403).json({
      success: false,
      message: 'Only Admin role can manage channel and system configuration'
    });
  }

  return next();
};

const normalizeChannelUpdates = (body) => {
  const updates = {};

  if (body.label !== undefined) {
    const label = String(body.label).trim();
    if (!label) return { error: 'label cannot be empty' };
    updates.label = label.slice(0, 255);
  }

  if (body.priority !== undefined) {
    const priority = String(body.priority).toUpperCase();
    if (!validPriorities.includes(priority)) {
      return { error: 'Invalid priority. Allowed values: CRITICAL, WARNING, INFO' };
    }
    updates.priority = priority;
  }

  if (body.message !== undefined) {
    updates.message = body.message === null ? null : String(body.message).trim().slice(0, 500);
  }

  if (body.delay !== undefined || body.delay_ms !== undefined) {
    const rawDelay = body.delay !== undefined ? body.delay : body.delay_ms;
    const delay = Number.parseInt(rawDelay, 10);
    if (Number.isNaN(delay) || delay < 0) {
      return { error: 'delay must be a non-negative integer' };
    }
    updates.delay_ms = delay;
  }

  if (body.blink !== undefined || body.blink_pattern !== undefined) {
    const rawBlink = body.blink !== undefined ? body.blink : body.blink_pattern;
    const blink = String(rawBlink).trim();
    if (!blink) {
      return { error: 'blink cannot be empty' };
    }
    updates.blink_pattern = blink.slice(0, 50);
  }

  if (body.group_id !== undefined) {
    if (body.group_id === null || body.group_id === '') {
      updates.group_id = null;
    } else {
      const groupId = Number.parseInt(body.group_id, 10);
      if (Number.isNaN(groupId) || groupId <= 0) {
        return { error: 'group_id must be a positive integer or null' };
      }
      updates.group_id = groupId;
    }
  }

  if (body.is_enabled !== undefined) {
    updates.is_enabled = Boolean(body.is_enabled);
  }

  return { updates };
};

exports.getDeviceChannels = async (req, res, next) => {
  try {
    const deviceId = parsePositiveInt(req.query.device_id, null);
    if (!deviceId) {
      return sendError(next, 'Valid device_id query parameter is required', 400);
    }

    const device = await Device.findByPk(deviceId, {
      attributes: ['device_id', 'device_name', 'hardware_uid']
    });

    if (!device) {
      return sendError(next, 'Device not found', 404);
    }

    const channels = await Channel.findAll({
      where: { device_id: deviceId },
      order: [['channel_number', 'ASC']],
      attributes: [
        'channel_id',
        'device_id',
        'channel_number',
        'label',
        'priority',
        'message',
        'delay_ms',
        'blink_pattern',
        'group_id',
        'is_enabled'
      ]
    });

    return res.status(200).json({
      success: true,
      data: {
        device,
        total_channels: channels.length,
        channels
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateChannelSettings = async (req, res, next) => {
  const channelId = parsePositiveInt(req.params.channel_id, null);
  if (!channelId) {
    return sendError(next, 'Invalid channel_id', 400);
  }

  const parsed = normalizeChannelUpdates(req.body || {});
  if (parsed.error) {
    return sendError(next, parsed.error, 400);
  }

  if (!Object.keys(parsed.updates).length) {
    return sendError(next, 'No updatable channel fields provided', 400);
  }

  const transaction = await sequelize.transaction();

  try {
    const channel = await Channel.findByPk(channelId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!channel) {
      await transaction.rollback();
      return sendError(next, 'Channel not found', 404);
    }

    parsed.updates.updated_by = req.user?.name || String(req.user?.user_id || 'SYSTEM');
    await channel.update(parsed.updates, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: channel,
      message: 'Channel settings updated successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.bulkUpdateDeviceChannels = async (req, res, next) => {
  const deviceId = parsePositiveInt(req.params.device_id, null);
  if (!deviceId) {
    return sendError(next, 'Invalid device_id', 400);
  }

  const payload = Array.isArray(req.body?.channels) ? req.body.channels : null;
  if (!payload || !payload.length) {
    return sendError(next, 'channels array is required', 400);
  }

  const transaction = await sequelize.transaction();

  try {
    const device = await Device.findByPk(deviceId, { transaction });
    if (!device) {
      await transaction.rollback();
      return sendError(next, 'Device not found', 404);
    }

    const updatedChannels = [];

    for (const entry of payload) {
      const channelId = parsePositiveInt(entry.channel_id, null);
      const channelNumber = parsePositiveInt(entry.channel_number, null);

      if (!channelId && !channelNumber) {
        await transaction.rollback();
        return sendError(next, 'Each channel entry must include channel_id or channel_number', 400);
      }

      const where = channelId
        ? { channel_id: channelId, device_id: deviceId }
        : { channel_number: channelNumber, device_id: deviceId };

      const channel = await Channel.findOne({
        where,
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!channel) {
        await transaction.rollback();
        return sendError(next, `Channel not found for device ${deviceId}`, 404);
      }

      const parsed = normalizeChannelUpdates(entry);
      if (parsed.error) {
        await transaction.rollback();
        return sendError(next, parsed.error, 400);
      }

      if (Object.keys(parsed.updates).length) {
        parsed.updates.updated_by = req.user?.name || String(req.user?.user_id || 'SYSTEM');
        await channel.update(parsed.updates, { transaction });
      }

      updatedChannels.push(channel);
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        device_id: deviceId,
        updated_count: updatedChannels.length,
        channels: updatedChannels
      },
      message: 'Device channel settings updated successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.getSystemConfig = async (req, res, next) => {
  try {
    const deviceId = req.query.device_id !== undefined ? parsePositiveInt(req.query.device_id, null) : undefined;
    if (req.query.device_id !== undefined && !deviceId) {
      return sendError(next, 'Invalid device_id query parameter', 400);
    }

    const where = {};
    if (deviceId !== undefined) {
      where.device_id = deviceId;
    } else {
      where.device_id = null;
    }

    const config = await SystemConfig.findOne({ where });

    return res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
};

exports.upsertSystemConfig = async (req, res, next) => {
  const deviceId = req.body?.device_id !== undefined ? parsePositiveInt(req.body.device_id, null) : null;
  if (req.body?.device_id !== undefined && !deviceId) {
    return sendError(next, 'Invalid device_id value', 400);
  }

  const updates = {};

  const numericFields = [
    'hooter_timeout_seconds',
    'heartbeat_interval_seconds',
    'offline_threshold_seconds'
  ];

  for (const field of numericFields) {
    if (req.body[field] !== undefined) {
      const parsed = Number.parseInt(req.body[field], 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return sendError(next, `${field} must be a positive integer`, 400);
      }
      updates[field] = parsed;
    }
  }

  if (req.body.sms_gateway_api_key !== undefined) {
    updates.sms_gateway_api_key = req.body.sms_gateway_api_key
      ? String(req.body.sms_gateway_api_key).trim().slice(0, 255)
      : null;
  }

  if (req.body.emergency_contact_mobile !== undefined) {
    updates.emergency_contact_mobile = req.body.emergency_contact_mobile
      ? String(req.body.emergency_contact_mobile).trim().slice(0, 20)
      : null;
  }

  if (req.body.is_factory_locked !== undefined) {
    updates.is_factory_locked = Boolean(req.body.is_factory_locked);
  }

  if (!Object.keys(updates).length) {
    return sendError(next, 'No updatable system config fields provided', 400);
  }

  updates.updated_by = req.user?.user_id || null;

  const where = { device_id: deviceId || null };

  try {
    const [config] = await SystemConfig.findOrCreate({
      where,
      defaults: { ...where, ...updates }
    });

    if (config) {
      await config.update(updates);
    }

    return res.status(200).json({
      success: true,
      data: config,
      message: 'System configuration saved successfully'
    });
  } catch (error) {
    next(error);
  }
};
