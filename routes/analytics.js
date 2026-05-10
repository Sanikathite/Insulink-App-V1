'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth.middleware');
const checkAccess = require('../middlewares/access.middleware');
const analytics = require('../controllers/analytics.controller');

router.get(
  '/daily-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getDailyTrends
);

router.get(
  '/hourly-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getHourlyTrends
);

router.get(
  '/severity-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getSeverityTrends
);

router.get(
  '/top-alarms',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getTopAlarms
);

router.get(
  '/top-faults',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getTopFaults
);

router.get(
  '/top-critical-faults',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getTopCriticalFaults
);

router.get(
  '/channel-faults',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getChannelFaults
);

router.get(
  '/device-faults',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getDeviceFaults
);

router.get(
  '/severity-distribution',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getSeverityDistribution
);

router.get(
  '/fault-type-trends',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getFaultTypeTrends
);

router.get(
  '/recurring-summary',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getRecurringSummary
);

router.get(
  '/recurring-insights',
  auth.loginRequired,
  checkAccess({ accessKey: 'ALARM_DASHBOARD', permission: 'view' }),
  analytics.getRecurringInsights
);

module.exports = router;
