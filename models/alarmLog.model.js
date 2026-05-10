'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AlarmLog extends Model {
    static associate(models) {
      // PRD 12.4: Each log entry belongs to a specific input channel
      AlarmLog.belongsTo(models.Channel, {
        foreignKey: 'channel_id',
        as: 'channel'
      });

      AlarmLog.belongsTo(models.User, {
        foreignKey: 'acknowledged_by',
        as: 'ack_user'
      });

      AlarmLog.belongsTo(models.User, {
        foreignKey: 'reset_by',
        as: 'reset_user'
      });

      AlarmLog.belongsTo(models.AlarmSensorReading, {
        foreignKey: 'reading_id',
        as: 'sensor_reading',
        onDelete: 'SET NULL'
      });

      AlarmLog.belongsTo(models.AlarmThreshold, {
        foreignKey: 'threshold_id',
        as: 'threshold',
        onDelete: 'SET NULL'
      });
    }
  }

  AlarmLog.init(
    {
      alarm_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      reading_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      threshold_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      fault_type: {
        type: DataTypes.ENUM('UNDERCURRENT', 'OVERCURRENT'),
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'ACKNOWLEDGED', 'CLEARED', 'RESET'),
        defaultValue: 'ACTIVE',
        comment: 'ACTIVE = Unacknowledged fault, CLEARED = Normal but needs reset'
      },
      severity: {
        type: DataTypes.ENUM('CRITICAL', 'WARNING', 'INFO'),
        allowNull: false
      },
      fault_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'When the fault was first detected'
      },
      acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      acknowledged_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      cleared_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the physical fault condition actually stopped'
      },
      reset_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      reset_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      hooter_muted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Tracks when the device-level hooter was muted'
      },
      last_tested_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Tracks latest alarm test trigger time'
      },
      alarm_message: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'AlarmLog',
      tableName: 'alarm_logs',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['fault_at'] },
        { fields: ['channel_id'] },
        { fields: ['reading_id'] },
        { fields: ['threshold_id'] }
      ]
    }
  );

  return AlarmLog;
};