const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS orders_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      total_revenue DECIMAL(10,2) NOT NULL CHECK(total_revenue BETWEEN 0 AND 99999999.99),
      total_cost DECIMAL(10,2) NOT NULL CHECK(total_cost BETWEEN 0 AND 99999999.99),
      total_profit DECIMAL(10,2) NOT NULL,
      source_items TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS product_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_report_id INTEGER NOT NULL REFERENCES orders_reports(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL CHECK(stock_quantity >= 0),
      total_sold INTEGER NOT NULL CHECK(total_sold > 0),
      revenue DECIMAL(10,2) NOT NULL,
      cost DECIMAL(10,2) NOT NULL,
      profit DECIMAL(10,2) NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(order_report_id, product_id)
    );`);
  return db;
}
module.exports = { openDatabase };
