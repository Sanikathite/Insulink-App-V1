'use strict';

/**
 * Parse query params for analytics time windows.
 * Supported range: today | last24h | last7days | last30days | custom
 */
function parseEndOfDay(dateStr) {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return d;
}

function parseAnalyticsRange(query) {
  const range = String(query.range || 'last7days').toLowerCase();
  const now = new Date();
  let end = new Date(now);
  let start;

  switch (range) {
    case 'today': {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'last24h':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'last7days':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last30days':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'custom': {
      const sd = query.start_date;
      const ed = query.end_date;
      if (!sd || !ed) {
        return { error: 'custom_range_requires_dates' };
      }
      start = new Date(`${sd}T00:00:00.000`);
      end = parseEndOfDay(String(ed));
      break;
    }
    default:
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'invalid_date' };
  }

  return { start, end, range };
}

function previousRange(start, end) {
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - ms);
  return { prevStart, prevEnd };
}

module.exports = {
  parseAnalyticsRange,
  previousRange
};
