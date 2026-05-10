'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Device extends Model {
    static associate(models) {
      // PRD 12.8: Each device belongs to a specific substation/site
      Device.belongsTo(models.Site, {
        foreignKey: 'site_id',
        as: 'site',
        onDelete: 'CASCADE'
      });

      // PRD 10.2: Each device has 72 input channels
      Device.hasMany(models.Channel, {
        foreignKey: 'device_id',
        as: 'channels'
      });

      // For system health monitoring (PRD 10.1)
      Device.hasMany(models.SystemHealthLog, {
        foreignKey: 'device_id',
        as: 'health_logs'
      });

      Device.hasMany(models.AlarmSensorReading, {
        foreignKey: 'device_id',
        as: 'sensor_readings'
      });
    }
  }

  Device.init(
    {
      device_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      site_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      hardware_uid: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: false
      },
      device_name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      gsm_number: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      imei_number: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      connection_status: {
        type: DataTypes.ENUM('ONLINE', 'OFFLINE'),
        defaultValue: 'OFFLINE'
      },
      last_heartbeat: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // PRD 10.1: Smart diagnostics (Power status, Battery Level)
      power_source: {
        type: DataTypes.ENUM('AC', 'BATTERY'),
        defaultValue: 'AC'
      },
      battery_percentage: {
        type: DataTypes.INTEGER,
        validate: { min: 0, max: 100 }
      },
      firmware_version: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      created_by: DataTypes.STRING,
      updated_by: DataTypes.STRING
    },
    {
      sequelize,
      modelName: 'Device',
      tableName: 'devices',
      timestamps: true,
      underscored: true
    }
  );

  return Device;
};