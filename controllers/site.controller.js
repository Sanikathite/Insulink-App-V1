'use strict';
const { Site, Device } = require('../models');
const { Op } = require('sequelize');

const siteController = {
  // Create a new Site
  create: async (req, res, next) => {
    try {
      const { site_name, location, status } = req.body;

      // Ensure site_name is provided
      if (!site_name) {
        throw new Error("Site name is required");
      }

      const newSite = await Site.create({
        site_name,
        location,
        status: status || 'ACTIVE',
        created_by: req.user ? req.user.user_id.toString() : 'SYSTEM' // Assuming auth middleware sets req.user
      });

      res.locals.data = newSite;
      res.locals.message = "Site created successfully.";
      next();
    } catch (error) {
      next(error);
    }
  },

  // Get all Sites
  getAll: async (req, res, next) => {
    try {
      const sites = await Site.findAll({
        order: [['created_at', 'DESC']]
      });

      res.locals.data = sites;
      res.locals.message = "Sites retrieved successfully.";
      next();
    } catch (error) {
      next(error);
    }
  },

  // Get a single Site by ID (Includes attached devices)
  getById: async (req, res, next) => {
    try {
      const { site_id } = req.params;

      const site = await Site.findByPk(site_id, {
        include: [
          {
            model: Device,
            as: 'devices',
            attributes: ['device_id', 'device_name', 'hardware_uid', 'connection_status']
          }
        ]
      });

      if (!site) {
        throw new Error("Site not found");
      }

      res.locals.data = site;
      res.locals.message = "Site retrieved successfully.";
      next();
    } catch (error) {
      next(error);
    }
  },

  // Update a Site
  update: async (req, res, next) => {
    try {
      const { site_id } = req.params;
      const { site_name, location, status } = req.body;

      const site = await Site.findByPk(site_id);
      
      if (!site) {
        throw new Error("Site not found");
      }

      await site.update({
        site_name: site_name !== undefined ? site_name : site.site_name,
        location: location !== undefined ? location : site.location,
        status: status !== undefined ? status : site.status,
        updated_by: req.user ? req.user.user_id.toString() : 'SYSTEM'
      });

      res.locals.data = site;
      res.locals.message = "Site updated successfully.";
      next();
    } catch (error) {
      next(error);
    }
  },

  // Search Sites (For dropdowns or datatables)
  search: async (req, res, next) => {
    try {
      const { query } = req.query; // e.g., ?query=North
      
      let whereClause = {};
      if (query) {
        whereClause = {
          [Op.or]: [
            { site_name: { [Op.like]: `%${query}%` } },
            { location: { [Op.like]: `%${query}%` } }
          ]
        };
      }

      const sites = await Site.findAll({
        where: whereClause,
        order: [['site_name', 'ASC']]
      });

      res.locals.data = sites;
      res.locals.message = "Search results retrieved.";
      next();
    } catch (error) {
      next(error);
    }
  }
};

module.exports = siteController;