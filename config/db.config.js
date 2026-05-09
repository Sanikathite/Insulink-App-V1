const path = require('path');

// ✅ FORCE correct .env path
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

module.exports = {
  HOST: process.env.DB_HOST || "localhost",
  USER: process.env.DB_USER || "root",
  PASSWORD: process.env.DB_PASSWORD, // must match .env
  DB: process.env.DB_NAME,
  dialect: process.env.DB_DIALECT || "mysql",

  operatorsAliases: false,

  pool: {
    max: parseInt(process.env.DB_POOL_MAX) || 5,
    min: parseInt(process.env.DB_POOL_MIN) || 0,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
    idle: parseInt(process.env.DB_POOL_IDLE) || 10000
  },

  dialectOptions: {
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 60000
  }
};

console.log("DB CONFIG PASSWORD:", process.env.DB_PASSWORD);