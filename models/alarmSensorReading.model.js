'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AlarmSensorReading extends Model {
    static associate(models) {
      AlarmSensorReading.belongsTo(models.Device, {
        foreignKey: 'device_id',
        as: 'device',
        onDelete: 'CASCADE'
      });

      AlarmSensorReading.belongsTo(models.Channel, {
        foreignKey: 'channel_id',
        as: 'channel',
        onDelete: 'CASCADE'
      });

      AlarmSensorReading.belongsTo(models.AlarmThreshold, {
        foreignKey: 'threshold_id',
        as: 'threshold',
        onDelete: 'SET NULL'
      });

      AlarmSensorReading.hasMany(models.AlarmLog, {
        foreignKey: 'reading_id',
        as: 'alarm_logs'
      });
    }
  }

  AlarmSensorReading.init(
    {
      reading_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      device_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      threshold_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      reading_value: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      unit: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'V'
      },
      reading_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      fault_state: {
        type: DataTypes.ENUM('NORMAL', 'UNDERCURRENT', 'OVERCURRENT'),
        allowNull: false,
        defaultValue: 'NORMAL'
      }
    },
    {
      sequelize,
      modelName: 'AlarmSensorReading',
      tableName: 'alarm_sensor_readings',
      timestamps: false,
      underscored: true,
      hooks: {
        afterCreate: async (reading, options) => {
          const { AlarmThreshold, AlarmLog, Channel } = sequelize.models;
          if (!AlarmThreshold || !AlarmLog || !Channel) return;

          const transaction = options?.transaction;
          const threshold = reading.threshold_id
            ? await AlarmThreshold.findByPk(reading.threshold_id, { transaction })
            : await AlarmThreshold.findOne({
                where: { channel_id: reading.channel_id },
                transaction
              });

          if (!threshold) return;

          let faultState = 'NORMAL';
          if (reading.reading_value < threshold.lower_limit) {
            faultState = 'UNDERCURRENT';
          } else if (reading.reading_value > threshold.upper_limit) {
            faultState = 'OVERCURRENT';
          }

          if (faultState === 'NORMAL') return;

          const channel = await Channel.findByPk(reading.channel_id, { transaction });
          const unit = reading.unit || threshold.unit || 'V';
          const isUnder = faultState === 'UNDERCURRENT';
          const limit = isUnder ? threshold.lower_limit : threshold.upper_limit;
          const operator = isUnder ? '<' : '>';
          const kind = isUnder ? 'Undercurrent' : 'Overcurrent';
          const label = channel?.label ? ` (${channel.label})` : '';
          const channelRef = channel?.channel_number
            ? `Channel ${channel.channel_number}`
            : 'Channel';

          if (reading.fault_state !== faultState || reading.threshold_id !== threshold.threshold_id) {
            await reading.update(
              {
                fault_state: faultState,
                threshold_id: threshold.threshold_id
              },
              { transaction, hooks: false }
            );
          }

          await AlarmLog.create(
            {
              channel_id: reading.channel_id,
              reading_id: reading.reading_id,
              threshold_id: threshold.threshold_id,
              fault_type: faultState,
              status: 'ACTIVE',
              severity: channel?.priority || 'WARNING',
              fault_at: reading.reading_at,
              alarm_message: `${kind} on ${channelRef}${label}: ${reading.reading_value} ${unit} ${operator} ${limit} ${unit}`
            },
            { transaction }
          );
        }
      },
      indexes: [
        { fields: ['device_id'] },
        { fields: ['channel_id'] },
        { fields: ['reading_at'] }
      ]
    }
  );

  return AlarmSensorReading;
};
