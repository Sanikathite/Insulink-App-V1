'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Channel extends Model {
    static associate(models) {
      // PRD 10.2: Each channel belongs to one physical Device
      Channel.belongsTo(models.Device, {
        foreignKey: 'device_id',
        as: 'device',
        onDelete: 'CASCADE'
      });

      // PRD 12.4: A channel generates many Alarm logs over time
      Channel.hasMany(models.AlarmLog, {
        foreignKey: 'channel_id',
        as: 'alarm_logs'
      });

      Channel.hasMany(models.AlarmSensorReading, {
        foreignKey: 'channel_id',
        as: 'sensor_readings'
      });

      Channel.hasOne(models.AlarmThreshold, {
        foreignKey: 'channel_id',
        as: 'threshold'
      });
    }
  }

  Channel.init(
    {
      channel_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // PRD 10.1: Position in the 72-channel grid (1 to 72)
      channel_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 72 }
      },
      // PRD 12.7: Configurable fault caption (e.g., "Substation A Temp High")
      label: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'New Channel'
      },
      // PRD 12.4: Used for color-coding (Red=Critical, Yellow=Warning)
      priority: {
        type: DataTypes.ENUM('CRITICAL', 'WARNING', 'INFO'),
        defaultValue: 'WARNING'
      },
      message: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Alarm message template pushed to dashboard and notifications'
      },
      // PRD 10.2: Hardware logic type
      input_type: {
        type: DataTypes.ENUM('NO', 'NC'),
        defaultValue: 'NO',
        comment: 'Normally Open or Normally Closed'
      },
      // PRD 12.7: Time in milliseconds to wait before triggering alarm
      delay_ms: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      // PRD 12.7: For visual indication logic
      blink_pattern: {
        type: DataTypes.STRING(50),
        defaultValue: 'NORMAL',
        allowNull: true
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Optional group bucket for mass channel operations'
      },
      // Master toggle for the channel
      is_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      // PRD 12.7: Audit fields for Admin configuration changes
      created_by: DataTypes.STRING,
      updated_by: DataTypes.STRING
    },
    {
      sequelize,
      modelName: 'Channel',
      tableName: 'channels',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['device_id', 'channel_number']
        }
      ]
    }
  );

  return Channel;
};