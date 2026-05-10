'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AlarmThreshold extends Model {
    static associate(models) {
      AlarmThreshold.belongsTo(models.Channel, {
        foreignKey: 'channel_id',
        as: 'channel',
        onDelete: 'CASCADE'
      });

      AlarmThreshold.hasMany(models.AlarmSensorReading, {
        foreignKey: 'threshold_id',
        as: 'readings'
      });

      AlarmThreshold.hasMany(models.AlarmLog, {
        foreignKey: 'threshold_id',
        as: 'alarm_logs'
      });
    }
  }

  AlarmThreshold.init(
    {
      threshold_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
      },
      lower_limit: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      upper_limit: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      unit: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'V'
      },
      created_by: DataTypes.STRING,
      updated_by: DataTypes.STRING
    },
    {
      sequelize,
      modelName: 'AlarmThreshold',
      tableName: 'alarm_thresholds',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['channel_id'] }]
    }
  );

  return AlarmThreshold;
};
