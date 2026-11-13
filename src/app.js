const express = require('express');
const path = require('node:path');
const { createRemoteService } = require('./services/remote.service');
const { createReportRepository } = require('./repositories/report.repository');
const { createReportController } = require('./controllers/report.controller');
const { createAuthMiddleware } = require('./middleware/auth.middleware');
const { createReportRouter } = require('./routes/report.routes');
function createApp(db, config) {
  const app = express();
  const remote = createRemoteService(config);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.post('/ui/login', async (req, res) => {
    if (typeof req.body?.userName !== 'string' || typeof req.body?.password !== 'string') return res.status(400).json({ message: 'Nhập tên đăng nhập và mật khẩu.' });
    let response, data;
    try {
      response = await fetch(config.authUrl + '/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: req.body.userName, password: Buffer.from(req.body.password, 'utf8').toString('base64') }),
        signal: AbortSignal.timeout(config.timeout), redirect: 'error'
      });
      data = await response.json();
    } catch { return res.status(503).json({ message: 'Không kết nối được dịch vụ đăng nhập. Hãy chạy Lab 2.' }); }
    if (!response.ok) return res.status(response.status === 401 ? 401 : 503).json({ message: response.status === 401 ? 'Tên đăng nhập hoặc mật khẩu không đúng.' : 'Dịch vụ đăng nhập không khả dụng.' });
    if (typeof data.token !== 'string' || !data.token) return res.status(503).json({ message: 'Phản hồi đăng nhập không hợp lệ.' });
    res.set('Cache-Control', 'no-store').json({ token: data.token, userName: req.body.userName });
  });
  app.get('/ui/orders', createAuthMiddleware(remote), async (req, res) => {
    const orders = await remote.orders(req.get('Authorization'));
    if (!Array.isArray(orders)) return res.status(503).json({ message: 'Dữ liệu đơn hàng không hợp lệ.' });
    res.json(orders);
  });
  app.get('/ui/orders/:id', createAuthMiddleware(remote), async (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' });
    const order = await remote.order(Number(req.params.id), req.get('Authorization'));
    if (!Array.isArray(order?.items)) return res.status(503).json({ message: 'Chi tiết đơn hàng không hợp lệ.' });
    res.json(order);
  });
  app.use('/reports', createReportRouter(createReportController(createReportRepository(db), remote), createAuthMiddleware(remote)));
  app.use(express.static(path.join(__dirname, '../public')));
  app.use((req, res) => res.status(404).json({ message: 'API không tồn tại.' }));
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    res.status(status).json({ message: status === 500 ? 'Lỗi máy chủ.' : error.type === 'entity.parse.failed' ? 'JSON không hợp lệ.' : error.message });
  });
  return app;
}
module.exports = { createApp };
