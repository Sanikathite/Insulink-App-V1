'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { parseAnalyticsRange, previousRange } = require('../helpers/analyticsRange');

const ALARM_TYPE_EXPR =
  'COALESCE(NULLIF(TRIM(c.label), \'\'), \'Unlabeled Fault\')';

function ok(res, data) {
  return res.status(200).json({
    success: true,
    data
  });
}

function bad(req, res, next, message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return next(err);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function runSelect(sql, replacements) {
  const rows = await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT
  });
  return rows;
}

function normalizeSeverityRow(row) {
  const sev = String(row.severity || '').toUpperCase();
  const total = toNumber(row.total);
  let label = sev;
  if (sev === 'INFO') label = 'NORMAL';
  return { severity: sev, label, total };
}

function computeTrend(current, previous) {
  if (previous <= 0 && current <= 0) return { trend: 'stable', change_percent: 0 };
  if (previous <= 0 && current > 0) return { trend: 'up', change_percent: 100 };
  const changePercent = ((current - previous) / previous) * 100;
  const eps = 0.5;
  let trend = 'stable';
  if (changePercent > eps) trend = 'up';
  else if (changePercent < -eps) trend = 'down';
  return { trend, change_percent: Number(changePercent.toFixed(1)) };
}

function maintenanceFromFaultLabel(alarmType) {
  const t = String(alarmType || '').toLowerCase();
  const tips = [];
  if (t.includes('volt')) tips.push('Inspect transformer voltage regulation and tap settings.');
  if (t.includes('current') || t.includes('surge')) tips.push('Review breaker sizing and inrush limits; check for loose terminations.');
  if (t.includes('sensor')) tips.push('Schedule sensor calibration and wiring continuity checks.');
  if (t.includes('comm') || t.includes('communication')) tips.push('Verify communication paths, EMI shielding, and protocol timeouts.');
  if (t.includes('temp') || t.includes('thermal')) tips.push('Inspect cooling paths and thermal interfaces.');
  if (!tips.length) tips.push('Perform targeted inspection based on recurring alarm frequency.');
  return tips;
}

exports.getDailyTrends = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const { start, end } = parsed;

    const sql = `
      SELECT DATE(al.fault_at) AS date, COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY DATE(al.fault_at)
      ORDER BY date ASC
    `;

    const rows = await runSelect(sql, { start, end });
    const data = rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
      total: toNumber(row.total)
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getHourlyTrends = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const { start, end } = parsed;

    const sql = `
      SELECT HOUR(al.fault_at) AS hour, COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY HOUR(al.fault_at)
      ORDER BY hour ASC
    `;

    const rows = await runSelect(sql, { start, end });
    const data = rows.map((row) => ({
      hour: toNumber(row.hour),
      total: toNumber(row.total)
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getSeverityTrends = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const { start, end } = parsed;

    const sql = `
      SELECT DATE(al.fault_at) AS date, al.severity AS severity, COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY DATE(al.fault_at), al.severity
      ORDER BY date ASC, severity ASC
    `;

    const rows = await runSelect(sql, { start, end });
    const data = rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
      severity: String(row.severity || ''),
      total: toNumber(row.total)
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getTopAlarms = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const limit = Math.min(Math.max(toNumber(req.query.limit) || 20, 1), 100);
    const { start, end } = parsed;

    const sql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_name, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY ${ALARM_TYPE_EXPR}
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    const rows = await runSelect(sql, { start, end });
    const data = rows.map((row) => ({
      alarm_name: String(row.alarm_name),
      total: toNumber(row.total)
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getTopFaults = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const limit = Math.min(Math.max(toNumber(req.query.limit) || 25, 1), 200);
    const { start, end } = parsed;
    const { prevStart, prevEnd } = previousRange(start, end);

    const currentSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY ${ALARM_TYPE_EXPR}
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    const prevSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :prevStart AND :prevEnd
      GROUP BY ${ALARM_TYPE_EXPR}
    `;

    const [currentRows, prevRows] = await Promise.all([
      runSelect(currentSql, { start, end }),
      runSelect(prevSql, { prevStart, prevEnd })
    ]);

    const prevMap = new Map(prevRows.map((row) => [String(row.alarm_type), toNumber(row.total)]));

    const data = currentRows.map((row) => {
      const alarmType = String(row.alarm_type);
      const total = toNumber(row.total);
      const previousTotal = prevMap.get(alarmType) ?? 0;
      const trendInfo = computeTrend(total, previousTotal);
      return {
        alarm_type: alarmType,
        total,
        previous_total: previousTotal,
        trend: trendInfo.trend,
        change_percent: trendInfo.change_percent
      };
    });

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getTopCriticalFaults = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const limit = Math.min(Math.max(toNumber(req.query.limit) || 25, 1), 200);
    const { start, end } = parsed;
    const { prevStart, prevEnd } = previousRange(start, end);

    const currentSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
        AND al.severity = 'CRITICAL'
      GROUP BY ${ALARM_TYPE_EXPR}
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    const prevSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :prevStart AND :prevEnd
        AND al.severity = 'CRITICAL'
      GROUP BY ${ALARM_TYPE_EXPR}
    `;

    const [currentRows, prevRows] = await Promise.all([
      runSelect(currentSql, { start, end }),
      runSelect(prevSql, { prevStart, prevEnd })
    ]);

    const prevMap = new Map(prevRows.map((row) => [String(row.alarm_type), toNumber(row.total)]));

    const data = currentRows.map((row) => {
      const alarmType = String(row.alarm_type);
      const total = toNumber(row.total);
      const previousTotal = prevMap.get(alarmType) ?? 0;
      const trendInfo = computeTrend(total, previousTotal);
      return {
        alarm_type: alarmType,
        total,
        previous_total: previousTotal,
        trend: trendInfo.trend,
        change_percent: trendInfo.change_percent
      };
    });

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getChannelFaults = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const limit = Math.min(Math.max(toNumber(req.query.limit) || 50, 1), 500);
    const { start, end } = parsed;

    const sql = `
      SELECT
        al.channel_id AS channel_id,
        c.channel_number AS channel_number,
        c.label AS channel_label,
        COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY al.channel_id, c.channel_number, c.label
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    const rows = await runSelect(sql, { start, end });
    const data = rows.map((row) => ({
      channel_id: toNumber(row.channel_id),
      channel_number: toNumber(row.channel_number),
      channel_label: row.channel_label ? String(row.channel_label) : '',
      total: toNumber(row.total)
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getDeviceFaults = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const limit = Math.min(Math.max(toNumber(req.query.limit) || 50, 1), 500);
    const { start, end } = parsed;

    const sql = `
      SELECT
        d.device_id AS device_id,
        d.device_name AS device_name,
        COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      INNER JOIN devices AS d ON c.device_id = d.device_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY d.device_id, d.device_name
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    const rows = await runSelect(sql, { start, end });
    const data = rows.map((row) => ({
      device_id: toNumber(row.device_id),
      device_name: String(row.device_name || ''),
      total: toNumber(row.total)
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getSeverityDistribution = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const { start, end } = parsed;

    const sql = `
      SELECT al.severity AS severity, COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY al.severity
    `;

    const rows = await runSelect(sql, { start, end });
    const normalized = rows.map(normalizeSeverityRow);
    const sumTotal = normalized.reduce((acc, row) => acc + row.total, 0);

    const data = normalized.map((row) => ({
      severity: row.severity,
      label: row.label,
      total: row.total,
      percent: sumTotal > 0 ? Number(((row.total / sumTotal) * 100).toFixed(2)) : 0
    }));

    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

exports.getFaultTypeTrends = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const topN = Math.min(Math.max(toNumber(req.query.top) || 5, 2), 8);
    const { start, end } = parsed;

    const topSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY ${ALARM_TYPE_EXPR}
      ORDER BY total DESC
      LIMIT ${topN}
    `;

    const topRows = await runSelect(topSql, { start, end });
    const types = topRows.map((row) => String(row.alarm_type));

    if (!types.length) {
      return ok(res, { labels: [], series: [] });
    }

    const typeReplacements = {};
    const inList = types
      .map((type, index) => {
        const key = `type${index}`;
        typeReplacements[key] = type;
        return `:${key}`;
      })
      .join(', ');

    const trendSql = `
      SELECT
        DATE(al.fault_at) AS date,
        ${ALARM_TYPE_EXPR} AS alarm_type,
        COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
        AND ${ALARM_TYPE_EXPR} IN (${inList})
      GROUP BY DATE(al.fault_at), ${ALARM_TYPE_EXPR}
      ORDER BY date ASC
    `;

    const trendRows = await sequelize.query(trendSql, {
      replacements: { start, end, ...typeReplacements },
      type: QueryTypes.SELECT
    });

    const enumerateDays = (from, to) => {
      const days = [];
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(to);
      endDay.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= endDay.getTime()) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }
      return days;
    };

    const labels = enumerateDays(start, end);

    const matrix = new Map();
    types.forEach((t) => matrix.set(t, new Map()));

    trendRows.forEach((row) => {
      const alarmType = String(row.alarm_type);
      const d = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
      const total = toNumber(row.total);
      if (!matrix.has(alarmType)) matrix.set(alarmType, new Map());
      matrix.get(alarmType).set(d, total);
    });

    const series = types.map((alarmType) => ({
      alarm_type: alarmType,
      data: labels.map((day) => toNumber(matrix.get(alarmType)?.get(day) ?? 0))
    }));

    return ok(res, { labels, series });
  } catch (err) {
    return next(err);
  }
};

exports.getRecurringSummary = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const { start, end } = parsed;

    const totalSql = `
      SELECT COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :start AND :end
    `;

    const criticalSql = `
      SELECT COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :start AND :end
        AND al.severity = 'CRITICAL'
    `;

    const topFaultSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY ${ALARM_TYPE_EXPR}
      ORDER BY total DESC
      LIMIT 1
    `;

    const topDeviceSql = `
      SELECT d.device_id AS device_id, d.device_name AS device_name, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      INNER JOIN devices AS d ON c.device_id = d.device_id
      WHERE al.fault_at BETWEEN :start AND :end
      GROUP BY d.device_id, d.device_name
      ORDER BY total DESC
      LIMIT 1
    `;

    const [totalRows, critRows, topFaults, topDevices] = await Promise.all([
      runSelect(totalSql, { start, end }),
      runSelect(criticalSql, { start, end }),
      runSelect(topFaultSql, { start, end }),
      runSelect(topDeviceSql, { start, end })
    ]);

    const total_faults = toNumber(totalRows[0]?.total);
    const critical_faults = toNumber(critRows[0]?.total);

    const most_frequent_fault =
      topFaults[0] && topFaults[0].alarm_type
        ? { alarm_type: String(topFaults[0].alarm_type), total: toNumber(topFaults[0].total) }
        : null;

    const most_unstable_device =
      topDevices[0] && topDevices[0].device_id
        ? {
            device_id: toNumber(topDevices[0].device_id),
            device_name: String(topDevices[0].device_name || ''),
            total: toNumber(topDevices[0].total)
          }
        : null;

    return ok(res, {
      total_faults,
      critical_faults,
      most_frequent_fault,
      most_unstable_device
    });
  } catch (err) {
    return next(err);
  }
};

exports.getRecurringInsights = async (req, res, next) => {
  try {
    const parsed = parseAnalyticsRange(req.query);
    if (parsed.error === 'custom_range_requires_dates') {
      return bad(req, res, next, 'Custom range requires start_date and end_date (YYYY-MM-DD).', 400);
    }
    if (parsed.error === 'invalid_date') {
      return bad(req, res, next, 'Invalid date values.', 400);
    }

    const { start, end } = parsed;
    const { prevStart, prevEnd } = previousRange(start, end);

    const [
      currentTotals,
      prevTotals,
      topFaults,
      channelFaults,
      severityRows,
      criticalDaily
    ] = await Promise.all([
      runSelect(
        `SELECT COUNT(*) AS total FROM alarm_logs AS al WHERE al.fault_at BETWEEN :start AND :end`,
        { start, end }
      ),
      runSelect(
        `SELECT COUNT(*) AS total FROM alarm_logs AS al WHERE al.fault_at BETWEEN :prevStart AND :prevEnd`,
        { prevStart, prevEnd }
      ),
      runSelect(
        `
        SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
        FROM alarm_logs AS al
        INNER JOIN channels AS c ON al.channel_id = c.channel_id
        WHERE al.fault_at BETWEEN :start AND :end
        GROUP BY ${ALARM_TYPE_EXPR}
        ORDER BY total DESC
        LIMIT 5
      `,
        { start, end }
      ),
      runSelect(
        `
        SELECT al.channel_id AS channel_id, c.channel_number AS channel_number, COUNT(*) AS total
        FROM alarm_logs AS al
        INNER JOIN channels AS c ON al.channel_id = c.channel_id
        WHERE al.fault_at BETWEEN :start AND :end
        GROUP BY al.channel_id, c.channel_number
        ORDER BY total DESC
        LIMIT 3
      `,
        { start, end }
      ),
      runSelect(
        `
        SELECT al.severity AS severity, COUNT(*) AS total
        FROM alarm_logs AS al
        WHERE al.fault_at BETWEEN :start AND :end
        GROUP BY al.severity
      `,
        { start, end }
      ),
      runSelect(
        `
        SELECT DATE(al.fault_at) AS date, COUNT(*) AS total
        FROM alarm_logs AS al
        WHERE al.fault_at BETWEEN :start AND :end
          AND al.severity = 'CRITICAL'
        GROUP BY DATE(al.fault_at)
        ORDER BY date ASC
      `,
        { start, end }
      )
    ]);

    const currentTotal = toNumber(currentTotals[0]?.total);
    const prevTotal = toNumber(prevTotals[0]?.total);
    const overallTrend = computeTrend(currentTotal, prevTotal);

    const insights = [];
    const recommendations = [];

    if (currentTotal === 0) {
      insights.push({
        tone: 'info',
        text: 'No alarm records found for the selected period.'
      });
      return ok(res, { insights, recommendations, meta: { overallTrend } });
    }

    if (topFaults[0]) {
      const dominant = topFaults[0];
      const share = currentTotal > 0 ? (toNumber(dominant.total) / currentTotal) * 100 : 0;
      insights.push({
        tone: 'info',
        text: `${String(dominant.alarm_type)} is responsible for ${share.toFixed(1)}% of recorded alarms in this window.`
      });
      recommendations.push(...maintenanceFromFaultLabel(dominant.alarm_type).slice(0, 2));
    }

    if (overallTrend.trend === 'up' && overallTrend.change_percent >= 5) {
      insights.push({
        tone: overallTrend.change_percent > 25 ? 'critical' : 'warn',
        text: `Overall alarm volume increased by ${overallTrend.change_percent}% vs the previous period of equal length.`
      });
    } else if (overallTrend.trend === 'down' && overallTrend.change_percent <= -5) {
      insights.push({
        tone: 'good',
        text: `Overall alarm volume decreased by ${Math.abs(overallTrend.change_percent)}% vs the previous period.`
      });
    }

    const prevTopSql = `
      SELECT ${ALARM_TYPE_EXPR} AS alarm_type, COUNT(*) AS total
      FROM alarm_logs AS al
      INNER JOIN channels AS c ON al.channel_id = c.channel_id
      WHERE al.fault_at BETWEEN :prevStart AND :prevEnd
      GROUP BY ${ALARM_TYPE_EXPR}
    `;
    const prevTopRows = await runSelect(prevTopSql, { prevStart, prevEnd });
    const prevMap = new Map(prevTopRows.map((row) => [String(row.alarm_type), toNumber(row.total)]));

    topFaults.forEach((row) => {
      const name = String(row.alarm_type);
      const cur = toNumber(row.total);
      const prev = prevMap.get(name) ?? 0;
      const t = computeTrend(cur, prev);
      if (t.trend === 'up' && t.change_percent >= 15) {
        insights.push({
          tone: t.change_percent >= 40 ? 'critical' : 'warn',
          text: `${name} alarms increased by ${t.change_percent}% compared to the previous period.`
        });
      }
    });

    const critCurrent = severityRows
      .filter((r) => String(r.severity).toUpperCase() === 'CRITICAL')
      .reduce((acc, r) => acc + toNumber(r.total), 0);
    const critPrev = await runSelect(
      `
      SELECT COUNT(*) AS total
      FROM alarm_logs AS al
      WHERE al.fault_at BETWEEN :prevStart AND :prevEnd
        AND al.severity = 'CRITICAL'
    `,
      { prevStart, prevEnd }
    );
    const critPrevTotal = toNumber(critPrev[0]?.total);
    const critTrend = computeTrend(critCurrent, critPrevTotal);
    if (critTrend.trend === 'up' && critTrend.change_percent >= 10) {
      insights.push({
        tone: 'critical',
        text: `Critical severity alarms grew by ${critTrend.change_percent}% vs the previous period.`
      });
    }

    const last3 = criticalDaily.slice(-3).map((row) => toNumber(row.total));
    if (last3.length === 3 && last3[0] < last3[1] && last3[1] < last3[2]) {
      insights.push({
        tone: 'critical',
        text: 'Critical faults increased continuously over the latest 3 days with available data.'
      });
    }

    if (channelFaults[0]) {
      const ch = channelFaults[0];
      insights.push({
        tone: 'warn',
        text: `Channel ${toNumber(ch.channel_number)} shows elevated recurrence (${toNumber(ch.total)} alarms).`
      });
      recommendations.push(
        `Inspect field wiring and noise sources for channel ${toNumber(ch.channel_number)}.`
      );
    }

    const uniqRec = Array.from(new Set(recommendations)).slice(0, 8);

    return ok(res, {
      insights: insights.slice(0, 12),
      recommendations: uniqRec,
      meta: {
        overallTrend,
        period: { start, end },
        previous_period: { start: prevStart, end: prevEnd }
      }
    });
  } catch (err) {
    return next(err);
  }
};

// Vraut's features for analytics part 

const analyticsService = require("../services/analytics.service");
const { handleError } = require("../functions/sendResponse");

/**
 * Get alarm frequency per device
 * Query params: device_id, site_id, startDate, endDate
 */
exports.getAlarmFrequency = async (req, res, next) => {
  try {
    const { device_id, site_id, startDate, endDate } = req.query;

    const filters = {};

    if (device_id) filters.device_id = parseInt(device_id);
    if (site_id) filters.site_id = parseInt(site_id);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await analyticsService.getAlarmFrequency(filters);

    res.locals.data = result;
    next();
  } catch (error) {
    handleError(error, next, "Error fetching alarm frequency");
  }
};

/**
 * Get MTTA and MTTR per device
 * Query params: device_id, site_id, startDate, endDate
 */
exports.getMTTRMTTA = async (req, res, next) => {
  try {
    const { device_id, site_id, startDate, endDate } = req.query;

    const filters = {};

    if (device_id) filters.device_id = parseInt(device_id);
    if (site_id) filters.site_id = parseInt(site_id);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await analyticsService.getMTTRMTTA(filters);

    res.locals.data = result;
    next();
  } catch (error) {
    handleError(error, next, "Error calculating MTTA/MTTR");
  }
};

/**
 * Get repeated alarms in last 1 hour
 * Query params: device_id, site_id, threshold, startTime, endTime
 */
exports.getRepeatedAlarms = async (req, res, next) => {
  try {
    const {
      device_id,
      site_id,
      threshold,
      startTime,
      endTime
    } = req.query;

    const filters = {};

    if (device_id) filters.device_id = parseInt(device_id);
    if (site_id) filters.site_id = parseInt(site_id);
    if (threshold) filters.threshold = parseInt(threshold);
    if (startTime) filters.startTime = startTime;
    if (endTime) filters.endTime = endTime;

    const result = await analyticsService.getRepeatedAlarms(filters);

    res.locals.data = result;
    next();
  } catch (error) {
    handleError(error, next, "Error detecting repeated alarms");
  }
};

/**
 * Get anomaly detection results
 * Query params: device_id, site_id
 */
exports.getAnomalies = async (req, res, next) => {
  try {
    const { device_id, site_id } = req.query;

    const filters = {};

    if (device_id) filters.device_id = parseInt(device_id);
    if (site_id) filters.site_id = parseInt(site_id);

    const result = await analyticsService.getAnomalies(filters);

    res.locals.data = result;
    next();
  } catch (error) {
    handleError(error, next, "Error detecting anomalies");
  }
};

/**
 * Get device health scores
 * Query params: device_id, site_id
 */
exports.getDeviceHealth = async (req, res, next) => {
  try {
    const { device_id, site_id } = req.query;

    const filters = {};

    if (device_id) filters.device_id = parseInt(device_id);
    if (site_id) filters.site_id = parseInt(site_id);

    const result = await analyticsService.getDeviceHealth(filters);

    res.locals.data = result;
    next();
  } catch (error) {
    handleError(error, next, "Error calculating device health");
  }
};