'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth.middleware');
const checkAccess = require('../middlewares/access.middleware');
const configController = require('../controllers/config.controller');
const notificationController = require('../controllers/notification.controller');

// Admin endpoints for channel and logic configuration
router.get(
  '/channels',
  auth.loginRequired,
  checkAccess({ accessKey: 'DEVICE_MASTER', permission: 'view' }),
  configController.ensureAdminRole,
  configController.getDeviceChannels
);

router.put(
  '/channels/:channel_id',
  auth.loginRequired,
  checkAccess({ accessKey: 'DEVICE_MASTER', permission: 'edit' }),
  configController.ensureAdminRole,
  configController.updateChannelSettings
);

router.put(
  '/channels/device/:device_id/bulk',
  auth.loginRequired,
  checkAccess({ accessKey: 'DEVICE_MASTER', permission: 'edit' }),
  configController.ensureAdminRole,
  configController.bulkUpdateDeviceChannels
);

router.get(
  '/system',
  auth.loginRequired,
  checkAccess({ accessKey: 'DEVICE_MASTER', permission: 'view' }),
  configController.ensureAdminRole,
  configController.getSystemConfig
);

router.put(
  '/system',
  auth.loginRequired,
  checkAccess({ accessKey: 'DEVICE_MASTER', permission: 'edit' }),
  configController.ensureAdminRole,
  configController.upsertSystemConfig
);

// User endpoints for push preference management and FCM registration
router.get(
  '/notification-preferences',
  auth.loginRequired,
  notificationController.getNotificationPreference
);

router.put(
  '/notification-preferences',
  auth.loginRequired,
  notificationController.upsertNotificationPreference
);

router.put(
  '/notification-preferences/fcm-token',
  auth.loginRequired,
  notificationController.upsertFcmToken
);

module.exports = router;
