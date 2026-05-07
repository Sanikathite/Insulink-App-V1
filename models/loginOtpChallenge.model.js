'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LoginOtpChallenge extends Model {
    static associate(models) {
      LoginOtpChallenge.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
        onDelete: 'CASCADE'
      });
    }
  }

  LoginOtpChallenge.init(
    {
      challenge_id: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      phone_number: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      provider: {
        type: DataTypes.ENUM('TWILIO_VERIFY', 'LOCAL_DEV'),
        allowNull: false,
        defaultValue: 'LOCAL_DEV'
      },
      provider_sid: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      otp_hash: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      attempt_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      max_attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      verified_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'LoginOtpChallenge',
      tableName: 'login_otp_challenges',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['expires_at'] }
      ]
    }
  );

  return LoginOtpChallenge;
};
