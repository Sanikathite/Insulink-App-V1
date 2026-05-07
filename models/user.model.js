'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Role, {
        foreignKey: 'role_id',
        targetKey: 'role_id', 
        as: 'role',
        onDelete: 'RESTRICT'
      });
    }
  }

  User.init(
    {
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true }
      },
      contact: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      account_status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        defaultValue: 'ACTIVE'
      },
      created_by: DataTypes.STRING,
      updated_by: DataTypes.STRING,
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE
      }
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      underscored: true,
      timestamps: false,
    }
  );

  return User;
};