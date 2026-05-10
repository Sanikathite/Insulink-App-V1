'use strict';

const express = require("express");
const router = express.Router();

// Middlewares
const auth = require("../middlewares/auth.middleware");
const checkAccess = require("../middlewares/access.middleware");
const sendResponse = require("../functions/sendResponse");

// Controller
const sites = require("../controllers/site.controller");

router.get(
  "/search/records",
  auth.loginRequired,
  checkAccess({ accessKey: "DEVICE_MASTER" }),
  sites.search,
  sendResponse.sendFindResponse
);

// Create a new Site
router.post(
  "/",
  auth.loginRequired,
  checkAccess({ accessKey: "DEVICE_MASTER" }),
  sites.create,
  sendResponse.sendCreateResponse
);

// Get All Sites
router.get(
  "/",
  auth.loginRequired,
  checkAccess({ accessKey: "DEVICE_MASTER" }),
  sites.getAll,
  sendResponse.sendFindResponse
);

// Get a Single Site by ID
router.get(
  "/:site_id",
  auth.loginRequired,
  checkAccess({ accessKey: "DEVICE_MASTER" }),
  sites.getById,
  sendResponse.sendFindResponse
);

// Update a Site
router.put(
  "/:site_id",
  auth.loginRequired,
  checkAccess({ accessKey: "DEVICE_MASTER" }),
  sites.update,
  sendResponse.sendCreateResponse 
);

module.exports = router;