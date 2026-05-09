const analyticsService = require("../services/analytics.service");
const { handleError, sendError } = require("../functions/sendResponse");

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
 * Query params: device_id, site_id, threshold (default: 5), startTime, endTime
 */
exports.getRepeatedAlarms = async (req, res, next) => {
  try {
    const { device_id, site_id, threshold, startTime, endTime } = req.query;

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
