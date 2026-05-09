const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const sendResponse = require("../functions/sendResponse");
const auth = require("../middlewares/auth.middleware");
const checkAccess = require("../middlewares/access.middleware");

/**
 * GET /analytics/frequency
 * Get alarm frequency per device
 * Query params: device_id, site_id, startDate, endDate
 */
router.get(
  "/frequency",
  auth.loginRequired,
  checkAccess({ accessKey: "ANALYTICS" }),
  analyticsController.getAlarmFrequency,
  sendResponse.sendFindResponse
);

/**
 * GET /analytics/mttr-mtta
 * Get MTTA and MTTR per device
 * Query params: device_id, site_id, startDate, endDate
 */
router.get(
  "/mttr-mtta",
  auth.loginRequired,
  checkAccess({ accessKey: "ANALYTICS" }),
  analyticsController.getMTTRMTTA,
  sendResponse.sendFindResponse
);

/**
 * GET /analytics/repeated-alarms
 * Get repeated alarms in last 1 hour
 * Query params: device_id, site_id, threshold (default: 5)
 */
router.get(
  "/repeated-alarms",
  auth.loginRequired,
  checkAccess({ accessKey: "ANALYTICS" }),
  analyticsController.getRepeatedAlarms,
  sendResponse.sendFindResponse
);

/**
 * GET /analytics/anomalies
 * Get anomaly detection results
 * Query params: device_id, site_id
 */
router.get(
  "/anomalies",
  auth.loginRequired,
  checkAccess({ accessKey: "ANALYTICS" }),
  analyticsController.getAnomalies,
  sendResponse.sendFindResponse
);

/**
 * GET /analytics/device-health
 * Get device health scores
 * Query params: device_id, site_id
 */
router.get(
  "/device-health",
  auth.loginRequired,
  checkAccess({ accessKey: "ANALYTICS" }),
  analyticsController.getDeviceHealth,
  sendResponse.sendFindResponse
);

module.exports = router;
