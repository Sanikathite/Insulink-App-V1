'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      this.hasMany(models.User, {
        foreignKey: 'role_id',
        sourceKey: 'role_id', 
        as: 'users',
        onDelete: 'CASCADE'
      });

      if (models.RoleAccessRelation) {
        this.hasMany(models.RoleAccessRelation, {
          foreignKey: 'role_id',
          sourceKey: 'role_id', 
          as: 'role_access',
          onDelete: 'CASCADE'
        });
      }
    }
  }

  Role.init(
    {
      role_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      role_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        defaultValue: 'ACTIVE',
        allowNull: false
      },
      created_by: {
        type: DataTypes.STRING,
        allowNull: true
      },
      updated_by: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Role',
      tableName: 'roles',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  );

  return Role;
};