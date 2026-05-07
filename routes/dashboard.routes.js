'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth.middleware');
const checkAccess = require('../middlewares/access.middleware');
const sendResponse = require('../functions/sendResponse');
const dashboard = require('../controllers/dashboard.controller');

const allowedActionRoles = new Set(['ADMIN', 'OPERATOR']);

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

const ensureAlarmActionRole = (req, res, next) => {
  const roles = extractRoles(req.user);

  if (roles.includes('VIEWER')) {
    return res.status(403).json({
      success: false,
      message: 'Viewers are not allowed to perform alarm actions'
    });
  }

  if (!roles.some((role) => allowedActionRoles.has(role))) {
    return res.status(403).json({
      success: false,
      message: 'Only Admin and Operator roles can perform alarm actions'
    });
  }

  return next();
};

// Dropdown data for switching device in dashboard
router.get(
  '/devices',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  dashboard.getDevices,
  sendResponse.sendFindResponse
);

// Alarm data for selected device
router.get(
  '/alarms',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  dashboard.getDeviceAlarms,
  sendResponse.sendFindResponse
);

router.get(
  '/alarms/live',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  dashboard.getLiveAlarmStatus
);

router.post(
  '/alarms/:alarm_id/acknowledge',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_ACTIONS', permission: 'action' }),
  ensureAlarmActionRole,
  dashboard.acknowledgeAlarm
);

router.post(
  '/alarms/:alarm_id/mute',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_ACTIONS', permission: 'action' }),
  ensureAlarmActionRole,
  dashboard.muteAlarm
);

router.post(
  '/alarms/:alarm_id/reset',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_ACTIONS', permission: 'action' }),
  ensureAlarmActionRole,
  dashboard.resetAlarm
);

router.post(
  '/alarms/:alarm_id/test',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_ACTIONS', permission: 'action' }),
  ensureAlarmActionRole,
  dashboard.testAlarm
);

router.get(
  '/alarms/history',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  dashboard.getAlarmHistory
);

router.get(
  '/alarms/history/export',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  dashboard.exportAlarmHistory
);

router.get(
  '/alarms/audit',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  dashboard.getAlarmAuditTrail
);

router.get(
  '/health',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  dashboard.getDeviceHealthSnapshot
);

module.exports = router;