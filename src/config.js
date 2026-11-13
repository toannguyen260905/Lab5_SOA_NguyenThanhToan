const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
function getConfig() {
  const port = Number(process.env.PORT || 3004);
  const timeout = Number(process.env.SERVICE_TIMEOUT_MS || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ.');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw new Error('SERVICE_TIMEOUT_MS không hợp lệ.');
  const config = { port, timeout, dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || 'data/lab5.sqlite') };
  for (const [key, env, fallback] of [['authUrl','AUTH_SERVICE_URL',3001], ['productUrl','PRODUCT_SERVICE_URL',3002], ['orderUrl','ORDER_SERVICE_URL',3003]]) {
    const url = new URL(process.env[env] || `http://127.0.0.1:${fallback}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${env} không hợp lệ.`);
    config[key] = url.href.replace(/\/$/, '');
  }
  return config;
}
module.exports = { getConfig };
