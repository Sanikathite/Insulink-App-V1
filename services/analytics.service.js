const { AlarmLog, AlarmAction, Channel, Device, Site, sequelize } = require("../models");
const { Op } = require("sequelize");

/**
 * Get alarm frequency grouped by device
 * @param {Object} filters - Optional filters (device_id, site_id, startDate, endDate)
 * @returns {Array} - Array of device alarm counts
 */
exports.getAlarmFrequency = async (filters = {}) => {
  const { device_id, site_id, startDate, endDate } = filters;

  const where = {};
  if (startDate || endDate) {
    where.fault_at = {};
    if (startDate) where.fault_at[Op.gte] = startDate;
    if (endDate) where.fault_at[Op.lte] = endDate;
  }

  const results = await AlarmLog.findAll({
    attributes: [
      [sequelize.col('channel.device.device_id'), 'device_id'],
      [sequelize.col('channel.device.site.site_id'), 'site_id'],
      [sequelize.col('channel.device.device_name'), 'device_name'],
      [sequelize.fn('COUNT', sequelize.col('alarm_id')), 'alarm_count']
    ],
    include: [
      {
        model: Channel,
        as: 'channel',
        attributes: [],
        include: [
          {
            model: Device,
            as: 'device',
            attributes: [],
            where: device_id ? { device_id } : undefined,
            include: [
              {
                model: Site,
                as: 'site',
                attributes: [],
                where: site_id ? { site_id } : undefined
              }
            ]
          }
        ]
      }
    ],
    where,
    group: ['channel.device.device_id', 'channel.device.site.site_id', 'channel.device.device_name'],
    order: [[sequelize.literal('alarm_count'), 'DESC']],
    raw: true
  });

  return results.map(r => ({
    device_id: r.device_id,
    site_id: r.site_id,
    device_name: r.device_name,
    alarm_count: parseInt(r.alarm_count)
  }));
};

/**
 * Calculate MTTA (Mean Time To Acknowledge) and MTTR (Mean Time To Repair)
 * @param {Object} filters - Optional filters (device_id, site_id, startDate, endDate)
 * @returns {Array} - Array of MTTA/MTTR per device
 */
exports.getMTTRMTTA = async (filters = {}) => {
  const { device_id, site_id, startDate, endDate } = filters;

  const where = {};
  if (startDate || endDate) {
    where.fault_at = {};
    if (startDate) where.fault_at[Op.gte] = startDate;
    if (endDate) where.fault_at[Op.lte] = endDate;
  }

  // Get all alarms with their first acknowledge and last reset actions
  const alarms = await AlarmLog.findAll({
    attributes: [
      'alarm_id',
      'fault_at',
      'severity',
      'channel_id'
    ],
    where
  });

  // Fetch all channels with device and site info
  const channels = await Channel.findAll({
    attributes: ['channel_id', 'device_id'],
    include: [
      {
        model: Device,
        as: 'device',
        attributes: ['device_id', 'device_name', 'site_id'],
        where: device_id ? { device_id } : undefined,
        include: [
          {
            model: Site,
            as: 'site',
            attributes: ['site_id', 'site_name'],
            where: site_id ? { site_id } : undefined
          }
        ]
      }
    ]
  });

  // Create channel lookup map
  const channelMap = {};
  channels.forEach(ch => {
    channelMap[ch.channel_id] = ch;
  });

  const deviceMetrics = {};

  for (const alarm of alarms) {
    // Get channel info from map
    const channel = channelMap[alarm.channel_id];
    
    // Skip if channel or device is not found
    if (!channel || !channel.device) {
      continue;
    }

    const devId = channel.device.device_id;
    const devName = channel.device.device_name;
    const siteId = channel.device.site?.site_id;
    const siteName = channel.device.site?.site_name;

    if (!deviceMetrics[devId]) {
      deviceMetrics[devId] = {
        device_id: devId,
        device_name: devName,
        site_id: siteId,
        site_name: siteName,
        total_alarms: 0,
        acknowledged_alarms: 0,
        reset_alarms: 0,
        mtta_seconds: [],
        mttr_seconds: []
      };
    }

    deviceMetrics[devId].total_alarms++;

    // Get first acknowledge action
    const firstAck = await AlarmAction.findOne({
      where: {
        alarm_log_id: alarm.alarm_id,
        action_type: 'ACKNOWLEDGE'
      },
      order: [['performed_at', 'ASC']],
      attributes: ['performed_at']
    });

    // Get last reset action
    const lastReset = await AlarmAction.findOne({
      where: {
        alarm_log_id: alarm.alarm_id,
        action_type: 'RESET'
      },
      order: [['performed_at', 'DESC']],
      attributes: ['performed_at']
    });

    // Calculate MTTA
    if (firstAck && alarm.fault_at) {
      const mttaMs = new Date(firstAck.performed_at) - new Date(alarm.fault_at);
      deviceMetrics[devId].acknowledged_alarms++;
      deviceMetrics[devId].mtta_seconds.push(mttaMs / 1000);
    }

    // Calculate MTTR
    if (lastReset && alarm.fault_at) {
      const mttrMs = new Date(lastReset.performed_at) - new Date(alarm.fault_at);
      deviceMetrics[devId].reset_alarms++;
      deviceMetrics[devId].mttr_seconds.push(mttrMs / 1000);
    }
  }

  // Calculate averages
  return Object.values(deviceMetrics).map(metric => {
    const calculateAvg = (arr) => arr.length > 0 
      ? arr.reduce((a, b) => a + b, 0) / arr.length 
      : null;

    return {
      device_id: metric.device_id,
      device_name: metric.device_name,
      site_id: metric.site_id,
      site_name: metric.site_name,
      total_alarms: metric.total_alarms,
      acknowledged_alarms: metric.acknowledged_alarms,
      reset_alarms: metric.reset_alarms,
      mtta_seconds: calculateAvg(metric.mtta_seconds),
      mttr_seconds: calculateAvg(metric.mttr_seconds),
      mtta_formatted: formatDuration(calculateAvg(metric.mtta_seconds)),
      mttr_formatted: formatDuration(calculateAvg(metric.mttr_seconds))
    };
  });
};

/**
 * Detect repeated alarms in last 1 hour
 * @param {Object} filters - Optional filters (device_id, site_id, threshold)
 * @returns {Array} - Array of repeated alarm patterns
 */
exports.getRepeatedAlarms = async (filters = {}) => {
  const { device_id, site_id, threshold = 5, startTime, endTime } = filters;

  // Use provided time range or default to last 1 hour
  let where = {};
  if (startTime && endTime) {
    where.fault_at = {
      [Op.gte]: new Date(startTime),
      [Op.lte]: new Date(endTime)
    };
  } else {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    where.fault_at = { [Op.gte]: oneHourAgo };
  }

  // Get alarms in last hour
  const alarms = await AlarmLog.findAll({
    attributes: [
      'alarm_id',
      'channel_id',
      'severity',
      'fault_at'
    ],
    where,
    order: [['fault_at', 'DESC']]
  });

  // Fetch all channels with device and site info
  const channels = await Channel.findAll({
    attributes: ['channel_id', 'channel_number', 'label', 'device_id'],
    include: [
      {
        model: Device,
        as: 'device',
        attributes: ['device_id', 'device_name', 'site_id'],
        where: device_id ? { device_id } : undefined,
        include: [
          {
            model: Site,
            as: 'site',
            attributes: ['site_id', 'site_name'],
            where: site_id ? { site_id } : undefined
          }
        ]
      }
    ]
  });

  // Create channel lookup map
  const channelMap = {};
  channels.forEach(ch => {
    channelMap[ch.channel_id] = ch;
  });

  // Group by channel_id
  const channelGroup = {};
  alarms.forEach(alarm => {
    const channelId = alarm.channel_id;
    const channel = channelMap[channelId];
    
    // Skip if channel not found
    if (!channel) {
      return;
    }

    if (!channelGroup[channelId]) {
      channelGroup[channelId] = {
        channel_id: channelId,
        channel_number: channel.channel_number,
        label: channel.label,
        device_id: channel.device?.device_id,
        device_name: channel.device?.device_name,
        site_id: channel.device?.site?.site_id,
        site_name: channel.device?.site?.site_name,
        alarm_count: 0,
        severity_distribution: {},
        alarms: []
      };
    }
    channelGroup[channelId].alarm_count++;
    channelGroup[channelId].severity_distribution[alarm.severity] = 
      (channelGroup[channelId].severity_distribution[alarm.severity] || 0) + 1;
    channelGroup[channelId].alarms.push({
      alarm_id: alarm.alarm_id,
      severity: alarm.severity,
      fault_at: alarm.fault_at
    });
  });

  // Filter by threshold
  return Object.values(channelGroup)
    .filter(group => group.alarm_count >= threshold)
    .map(group => ({
      channel_id: group.channel_id,
      channel_number: group.channel_number,
      label: group.label,
      device_id: group.device_id,
      device_name: group.device_name,
      site_id: group.site_id,
      site_name: group.site_name,
      alarm_count: group.alarm_count,
      severity_distribution: group.severity_distribution,
      recent_alarms: group.alarms.slice(0, 5) // Last 5 alarms
    }));
};

/**
 * Detect abnormal spike in alarms
 * @param {Object} filters - Optional filters (device_id, site_id)
 * @returns {Object} - Anomaly detection results
 */
exports.getAnomalies = async (filters = {}) => {
  const { device_id, site_id } = filters;

  const where = {};
  const deviceWhere = device_id ? { device_id } : undefined;
  const siteWhere = site_id ? { site_id } : undefined;

  // Get daily alarm counts for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyCounts = await AlarmLog.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('fault_at')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('alarm_id')), 'count']
    ],
    include: [
      {
        model: Channel,
        as: 'channel',
        attributes: [],
        include: [
          {
            model: Device,
            as: 'device',
            attributes: [],
            where: deviceWhere,
            include: [
              {
                model: Site,
                as: 'site',
                attributes: [],
                where: siteWhere
              }
            ]
          }
        ]
      }
    ],
    where: {
      fault_at: { [Op.gte]: thirtyDaysAgo }
    },
    group: [sequelize.fn('DATE', sequelize.col('fault_at'))],
    order: [[sequelize.fn('DATE', sequelize.col('fault_at')), 'ASC']],
    raw: true
  });

  if (dailyCounts.length < 2) {
    return {
      anomaly_detected: false,
      message: 'Insufficient data for anomaly detection (need at least 2 days)',
      daily_counts: dailyCounts.map(d => ({ date: d.date, count: parseInt(d.count) }))
    };
  }

  // Calculate average (excluding today)
  const today = new Date().toISOString().split('T')[0];
  const historicalData = dailyCounts.filter(d => d.date !== today);
  const todayData = dailyCounts.find(d => d.date === today);

  const averageCount = historicalData.reduce((sum, d) => sum + parseInt(d.count), 0) / historicalData.length;
  const todayCount = todayData ? parseInt(todayData.count) : 0;

  // Anomaly threshold: 1.5x average
  const threshold = averageCount * 1.5;
  const isAnomaly = todayCount > threshold;

  return {
    anomaly_detected: isAnomaly,
    average_daily_alarms: Math.round(averageCount),
    today_alarm_count: todayCount,
    threshold: Math.round(threshold),
    percentage_increase: averageCount > 0 ? Math.round(((todayCount - averageCount) / averageCount) * 100) : 0,
    daily_counts: dailyCounts.map(d => ({ date: d.date, count: parseInt(d.count) })),
    message: isAnomaly 
      ? `Anomaly detected: Today's alarm count (${todayCount}) is ${Math.round(((todayCount - averageCount) / averageCount) * 100)}% above average`
      : 'No anomaly detected: Alarm count is within normal range'
  };
};

/**
 * Compute health score per device
 * @param {Object} filters - Optional filters (device_id, site_id)
 * @returns {Array} - Array of device health scores
 */
exports.getDeviceHealth = async (filters = {}) => {
  const { device_id, site_id } = filters;

  const where = {};
  const deviceWhere = device_id ? { device_id } : undefined;
  const siteWhere = site_id ? { site_id } : undefined;

  // Get all devices with their alarm data
  const devices = await Device.findAll({
    attributes: ['device_id', 'device_name', 'connection_status', 'battery_percentage'],
    where: deviceWhere,
    include: [
      {
        model: Site,
        as: 'site',
        attributes: ['site_id', 'site_name'],
        where: siteWhere
      },
      {
        model: Channel,
        as: 'channels',
        attributes: ['channel_id']
      }
    ]
  });

  const healthScores = [];

  for (const device of devices) {
    // Get alarm frequency for this device (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const alarmCount = await AlarmLog.count({
      include: [
        {
          model: Channel,
          as: 'channel',
          attributes: [],
          where: { device_id: device.device_id }
        }
      ],
      where: {
        fault_at: { [Op.gte]: sevenDaysAgo }
      }
    });

    // Get severity distribution
    const severityData = await AlarmLog.findAll({
      attributes: [
        'severity',
        [sequelize.fn('COUNT', sequelize.col('alarm_id')), 'count']
      ],
      include: [
        {
          model: Channel,
          as: 'channel',
          attributes: [],
          where: { device_id: device.device_id }
        }
      ],
      where: {
        fault_at: { [Op.gte]: sevenDaysAgo }
      },
      group: ['severity'],
      raw: true,
    });

    const severityCounts = {};
    let severityWeight = 0;
    severityData.forEach(s => {
      severityCounts[s.severity] = parseInt(s.count);
      // CRITICAL = 3, WARNING = 2, INFO = 1
      const weight = s.severity === 'CRITICAL' ? 3 : s.severity === 'WARNING' ? 2 : 1;
      severityWeight += weight * parseInt(s.count);
    });

    // Get MTTR for this device
    const mttrData = await exports.getMTTRMTTA({ device_id: device.device_id });
    const avgMttr = mttrData.length > 0 ? mttrData[0].mttr_seconds : null;

    // Calculate health score (0-100)
    // Factors: alarm frequency (lower = better), severity (lower = better), MTTR (lower = better)
    let healthScore = 100;

    // Penalty for high alarm frequency (max 30 points)
    const alarmPenalty = Math.min(30, alarmCount * 2);
    healthScore -= alarmPenalty;

    // Penalty for severity (max 30 points)
    const severityPenalty = Math.min(30, severityWeight * 3);
    healthScore -= severityPenalty;

    // Penalty for high MTTR (max 20 points, assuming 1 hour = 3600s as baseline)
    if (avgMttr) {
      const mttrPenalty = Math.min(20, (avgMttr / 3600) * 20);
      healthScore -= mttrPenalty;
    }

    // Penalty for offline status (20 points)
    if (device.connection_status === 'OFFLINE') {
      healthScore -= 20;
    }

    // Penalty for low battery (10 points)
    if (device.battery_percentage < 20) {
      healthScore -= 10;
    }

    healthScore = Math.max(0, Math.round(healthScore));

    // Determine status
    let status = 'Healthy';
    if (healthScore < 50) {
      status = 'Critical';
    } else if (healthScore < 75) {
      status = 'Warning';
    }

    healthScores.push({
      device_id: device.device_id,
      device_name: device.device_name,
      site_id: device.site?.site_id,
      site_name: device.site?.site_name,
      connection_status: device.connection_status,
      battery_percentage: device.battery_percentage,
      health_score: healthScore,
      status: status,
      metrics: {
        alarm_count_7days: alarmCount,
        severity_distribution: severityCounts,
        avg_mttr_seconds: avgMttr,
        avg_mttr_formatted: formatDuration(avgMttr)
      }
    });
  }

  // Sort by health score (worst first)
  return healthScores.sort((a, b) => a.health_score - b.health_score);
};

/**
 * Helper function to format duration in seconds to human-readable format
 * @param {Number} seconds - Duration in seconds
 * @returns {String} - Formatted duration
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
