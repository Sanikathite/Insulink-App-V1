'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth.middleware');
const checkAccess = require('../middlewares/access.middleware');
const analytics = require('../controllers/analytics.controller');

router.get(
  '/daily-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  analytics.getDailyTrends
);

router.get(
  '/hourly-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  analytics.getHourlyTrends
);

router.get(
  '/severity-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  analytics.getSeverityTrends
);

router.get(
  '/top-alarms',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_HISTORY', permission: 'view' }),
  analytics.getTopAlarms
);

module.exports = router;
