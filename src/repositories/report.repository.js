function createReportRepository(db) {
  const table = kind => kind === 'orders' ? 'orders_reports' : 'product_reports';
  function find(kind, id) {
    const row = db.prepare(`SELECT * FROM ${table(kind)} WHERE id = ?`).get(id);
    if (row?.source_items) { row.items = JSON.parse(row.source_items); delete row.source_items; }
    return row;
  }
  function addProduct(parent, item) {
    const result = db.prepare(`INSERT INTO product_reports
      (order_report_id,product_id,product_name,stock_quantity,total_sold,revenue,cost,profit) VALUES (?,?,?,?,?,?,?,?)`)
      .run(parent, item.product_id, item.product_name, item.stock_quantity, item.total_sold, item.revenue, item.cost, item.profit);
    return find('products', Number(result.lastInsertRowid));
  }
  return {
    find,
    list(kind) { return db.prepare(`SELECT id FROM ${table(kind)} ORDER BY id DESC`).all().map(row => find(kind, row.id)); },
    byOrder(id) { return db.prepare('SELECT id FROM orders_reports WHERE order_id = ?').get(id); },
    hasProduct(parent, product) { return db.prepare('SELECT id FROM product_reports WHERE order_report_id = ? AND product_id = ?').get(parent, product); },
    addProduct,
    create(orderId, items, totals) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare(`INSERT INTO orders_reports (order_id,total_revenue,total_cost,total_profit,source_items) VALUES (?,?,?,?,?)`)
          .run(orderId, totals.revenue, totals.cost, totals.profit, JSON.stringify(items));
        const id = Number(result.lastInsertRowid);
        for (const item of items) addProduct(id, item);
        db.exec('COMMIT');
        return find('orders', id);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    delete(kind, id) { return db.prepare(`DELETE FROM ${table(kind)} WHERE id = ?`).run(id).changes; }
  };
}
module.exports = { createReportRepository };
