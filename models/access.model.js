'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Access extends Model {
    static associate(models) {
      Access.hasMany(models.RoleAccessRelation, {
        foreignKey: 'access_id',
        as: 'role_relations' 
      });
    }
  }

  Access.init(
    {
      access_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      module_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      module_name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Access',
      tableName: 'access',
      timestamps: false,
      underscored: true
    }
  );

  return Access;
}