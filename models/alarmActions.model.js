'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AlarmAction extends Model {
    static associate(models) {
      AlarmAction.belongsTo(models.AlarmLog, {
        foreignKey: 'alarm_log_id',
        as: 'alarm_event',
        onDelete: 'CASCADE'
      });

      AlarmAction.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'operator',
        onDelete: 'RESTRICT'
      });
    }
  }

  AlarmAction.init(
    {
      action_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      alarm_log_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      action_type: {
        type: DataTypes.ENUM('ACKNOWLEDGE', 'RESET', 'MUTE', 'TEST'),
        allowNull: false
      },
      target_entity: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
      },
      diff_payload: {
        type: DataTypes.JSON,
        allowNull: true
      },
      performed_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      remarks: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      source: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'AlarmAction',
      tableName: 'alarm_actions',
      timestamps: false, 
      underscored: true
    }
  );

  return AlarmAction;
};