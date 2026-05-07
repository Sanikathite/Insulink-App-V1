'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SystemConfig extends Model {
    static associate(models) {
      SystemConfig.belongsTo(models.Device, {
        foreignKey: 'device_id',
        as: 'device',
        onDelete: 'CASCADE'
      });
    }
  }

  SystemConfig.init(
    {
      config_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'If null, this is a global system-wide configuration'
      },
      hooter_timeout_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 60,
        validate: { min: 1, max: 86400 },
        comment: 'Auto-silence hooter after X seconds'
      },
      heartbeat_interval_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 30,
        validate: { min: 1, max: 3600 },
        comment: 'Frequency at which hardware pings the server'
      },
      offline_threshold_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 90,
        validate: { min: 1, max: 86400 },
        comment: 'Time after which a device is flagged as OFFLINE'
      },
      sms_gateway_api_key: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      emergency_contact_mobile: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'Primary number for critical system-fail alerts'
      },
      is_factory_locked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'If true, even Admins cannot change these via the App'
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'User ID of the Admin who last changed settings'
      }
    },
    {
      sequelize,
      modelName: 'SystemConfig',
      tableName: 'system_configs',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['device_id'] }
      ]
    }
  );

  return SystemConfig;
};