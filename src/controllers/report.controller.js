const { fail } = require('../services/remote.service');
const validId = value => Number.isSafeInteger(value) && value > 0;
const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 99999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const cents = value => Math.round(value * 100);
function createReportController(repo, remote) {
  function find(kind, id) { const row = repo.find(kind, id); if (!row) fail(404, 'Không tìm thấy báo cáo.'); return row; }
  async function buildOrder(req) {
      const { order_id, unit_costs } = req.body || {};
      if (!validId(order_id) || !Array.isArray(unit_costs) || !unit_costs.length) fail(400, 'Cần order_id và unit_costs: [{product_id, unit_cost}].');
      const costs = new Map();
      for (const row of unit_costs) {
        if (!validId(row?.product_id) || !validMoney(row.unit_cost) || costs.has(row.product_id)) fail(400, 'Giá vốn không hợp lệ hoặc product_id bị trùng.');
        costs.set(row.product_id, cents(row.unit_cost));
      }
      if (repo.byOrder(order_id)) fail(409, 'Đơn hàng đã có báo cáo.');
      const token = req.get('Authorization');
      const order = await remote.order(order_id, token);
      if (order?.id !== order_id || !Array.isArray(order.items) || !order.items.length || !['pending','completed','cancelled'].includes(order.status)) fail(503, 'Dữ liệu đơn hàng không hợp lệ.');
      if (order.status !== 'completed') fail(409, 'Chỉ lập báo cáo doanh thu cho đơn completed.');
      const items = [];
      const ids = new Set();
      let revenue = 0, cost = 0;
      for (const item of order.items) {
        if (!validId(item?.product_id) || ids.has(item.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647 || !validMoney(item.unit_price) || !validMoney(item.total_price) || typeof item.product_name !== 'string' || cents(item.total_price) !== cents(item.unit_price) * item.quantity) fail(503, 'Chi tiết đơn hàng không hợp lệ.');
        ids.add(item.product_id);
        if (!costs.has(item.product_id)) fail(400, 'Thiếu giá vốn cho sản phẩm trong đơn.');
        const product = await remote.product(item.product_id, token);
        if (product?.id !== item.product_id || !Number.isInteger(product.quantity) || product.quantity < 0 || product.quantity > 2147483647) fail(503, 'Dữ liệu tồn kho không hợp lệ.');
        const rowRevenue = cents(item.unit_price) * item.quantity;
        const rowCost = costs.get(item.product_id) * item.quantity;
        revenue += rowRevenue; cost += rowCost;
        if (!Number.isSafeInteger(revenue) || !Number.isSafeInteger(cost) || revenue > 9999999999 || cost > 9999999999) fail(400, 'Doanh thu hoặc chi phí vượt 99999999.99.');
        items.push({ product_id: item.product_id, product_name: item.product_name, stock_quantity: product.quantity, total_sold: item.quantity, unit_cost: costs.get(item.product_id) / 100, revenue: rowRevenue / 100, cost: rowCost / 100, profit: (rowRevenue - rowCost) / 100 });
      }
      if (costs.size !== ids.size) fail(400, 'unit_costs chứa sản phẩm ngoài đơn hàng.');
      if (!validMoney(order.total_amount) || cents(order.total_amount) !== revenue) fail(503, 'Tổng tiền đơn hàng không khớp chi tiết.');
      // Kiểm tra lại sau các HTTP await để chặn hai request tạo trùng.
      if (repo.byOrder(order_id)) fail(409, 'Đơn hàng đã có báo cáo.');
      const report = repo.create(order_id, items, { revenue: revenue / 100, cost: cost / 100, profit: (revenue - cost) / 100 });
      return report;
  }
  const controller = {
    list: kind => (req, res) => res.json(repo.list(kind)),
    detail: kind => (req, res) => res.json(find(kind, req.recordId)),
    remove: kind => (req, res) => { if (!repo.delete(kind, req.recordId)) fail(404, 'Không tìm thấy báo cáo.'); res.status(204).end(); },
    async createOrder(req, res) {
      const report = await buildOrder(req);
      res.location(`/reports/orders/${report.id}`).status(201).json(report);
    },
    async createProduct(req, res) {
      let { order_report_id, product_id } = req.body || {};
      if (!validId(product_id)) fail(400, 'product_id phải là số nguyên dương.');
      if (req.body.order_id !== undefined && order_report_id !== undefined) fail(400, 'Chỉ chọn order_id hoặc order_report_id.');
      if (req.body.order_id !== undefined) {
        if (!validId(req.body.order_id)) fail(400, 'order_id phải là số nguyên dương.');
        // Tạo cả bản chụp đơn hàng và sản phẩm trong cùng transaction.
        // Kiểm tra sản phẩm trước khi lưu bất kỳ bản ghi nào.
        const order = await remote.order(req.body.order_id, req.get('Authorization'));
        if (!Array.isArray(order?.items)) fail(503, 'Dữ liệu đơn hàng không hợp lệ.');
        if (!order.items.some(item => item.product_id === product_id)) fail(400, 'Sản phẩm không thuộc đơn hàng.');
        const parent = await buildOrder(req);
        const report = repo.list('products').find(row => row.order_report_id === parent.id && row.product_id === product_id);
        return res.location(`/reports/products/${report.id}`).status(201).json(report);
      }
      if (!validId(order_report_id) || !validId(product_id)) fail(400, 'Cần order_report_id và product_id nguyên dương.');
      const parent = find('orders', order_report_id);
      const item = parent.items.find(row => row.product_id === product_id);
      if (!item) fail(400, 'Sản phẩm không thuộc báo cáo đơn hàng.');
      if (repo.hasProduct(order_report_id, product_id)) fail(409, 'Báo cáo sản phẩm đã tồn tại.');
      const report = repo.addProduct(order_report_id, item);
      res.location(`/reports/products/${report.id}`).status(201).json(report);
    }
  };
  return controller;
}
module.exports = { createReportController };
