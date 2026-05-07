'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NotificationPreference extends Model {
    static associate(models) {
      NotificationPreference.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
        onDelete: 'CASCADE'
      });

      NotificationPreference.belongsTo(models.Site, {
        foreignKey: 'site_id',
        as: 'site',
        onDelete: 'CASCADE'
      });
    }
  }

  NotificationPreference.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      site_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'If null, these are global settings for all sites'
      },
      push_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      sms_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Phase 1: SMS alerts'
      },
      sound_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      vibration_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      min_severity_level: {
        type: DataTypes.ENUM('CRITICAL', 'WARNING', 'INFO'),
        defaultValue: 'INFO'
      },
      fcm_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Device token required to send push notifications'
      }
    },
    {
      sequelize,
      modelName: 'NotificationPreference',
      tableName: 'notification_preferences',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'site_id']
        },
        {
          fields: ['push_enabled', 'site_id']
        },
        {
          fields: ['fcm_token']
        }
      ]
    }
  );

  return NotificationPreference;
};