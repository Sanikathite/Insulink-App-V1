'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { sendError } = require('../functions/sendResponse');

const PRESET_MAP = {
  today: 0,
  last7days: 6,
  last30days: 29
};

const toDateOnly = (date) => date.toISOString().slice(0, 10);

const parseDateInput = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildRange = (req) => {
  const presetRaw = typeof req.query.range === 'string' ? req.query.range.trim().toLowerCase() : '';
  const preset = PRESET_MAP[presetRaw];

  const startDateInput = parseDateInput(req.query.start_date || req.query.from_date);
  const endDateInput = parseDateInput(req.query.end_date || req.query.to_date);

  if ((req.query.start_date || req.query.from_date) && !startDateInput) {
    return { error: { message: 'Invalid start date', status: 400 } };
  }

  if ((req.query.end_date || req.query.to_date) && !endDateInput) {
    return { error: { message: 'Invalid end date', status: 400 } };
  }

  if (startDateInput && endDateInput && startDateInput > endDateInput) {
    return { error: { message: 'start_date cannot be greater than end_date', status: 400 } };
  }

  if (startDateInput || endDateInput) {
    return {
      start: startDateInput ? toDateOnly(startDateInput) : null,
      end: endDateInput ? toDateOnly(endDateInput) : null
    };
  }

  if (typeof preset === 'number') {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - preset);
    return {
      start: toDateOnly(start),
      end: toDateOnly(end)
    };
  }

  return { start: null, end: null };
};

const getTimestampExpr = () => 'COALESCE(fault_at, created_at)';

const buildWhereClause = (range) => {
  const conditions = [];
  const replacements = {};

  if (range.start) {
    conditions.push(`${getTimestampExpr()} >= :startDate`);
    replacements.startDate = `${range.start} 00:00:00`;
  }

  if (range.end) {
    conditions.push(`${getTimestampExpr()} <= :endDate`);
    replacements.endDate = `${range.end} 23:59:59`;
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, replacements };
};

const executeQuery = async (sql, replacements) => {
  return sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT
  });
};

exports.getDailyTrends = async (req, res, next) => {
  try {
    const range = buildRange(req);
    if (range.error) {
      return sendError(next, range.error.message, range.error.status);
    }

    const { whereSql, replacements } = buildWhereClause(range);
    const rows = await executeQuery(
      `
        SELECT DATE(${getTimestampExpr()}) AS date, COUNT(*) AS total
        FROM alarm_logs
        ${whereSql}
        GROUP BY DATE(${getTimestampExpr()})
        ORDER BY DATE(${getTimestampExpr()}) ASC
      `,
      replacements
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getHourlyTrends = async (req, res, next) => {
  try {
    const range = buildRange(req);
    if (range.error) {
      return sendError(next, range.error.message, range.error.status);
    }

    const { whereSql, replacements } = buildWhereClause(range);
    const rows = await executeQuery(
      `
        SELECT HOUR(${getTimestampExpr()}) AS hour, COUNT(*) AS total
        FROM alarm_logs
        ${whereSql}
        GROUP BY HOUR(${getTimestampExpr()})
        ORDER BY HOUR(${getTimestampExpr()}) ASC
      `,
      replacements
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getSeverityTrends = async (req, res, next) => {
  try {
    const range = buildRange(req);
    if (range.error) {
      return sendError(next, range.error.message, range.error.status);
    }

    const { whereSql, replacements } = buildWhereClause(range);
    const rows = await executeQuery(
      `
        SELECT DATE(${getTimestampExpr()}) AS date, severity, COUNT(*) AS total
        FROM alarm_logs
        ${whereSql}
        GROUP BY DATE(${getTimestampExpr()}), severity
        ORDER BY DATE(${getTimestampExpr()}) ASC, severity ASC
      `,
      replacements
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getTopAlarms = async (req, res, next) => {
  try {
    const range = buildRange(req);
    if (range.error) {
      return sendError(next, range.error.message, range.error.status);
    }

    const { whereSql, replacements } = buildWhereClause(range);
    const rows = await executeQuery(
      `
        SELECT COALESCE(alarm_message, 'Unknown Alarm') AS alarm_name, COUNT(*) AS total
        FROM alarm_logs
        ${whereSql}
        GROUP BY COALESCE(alarm_message, 'Unknown Alarm')
        ORDER BY total DESC
        LIMIT 5
      `,
      replacements
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};
