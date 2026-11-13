const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const bcrypt = require('../../Lab-2/node_modules/bcryptjs');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { openDatabase: authDb } = require('../../Lab-2/src/db');
const { createApp: authApp } = require('../../Lab-2/src/app');
const { createUserRepository } = require('../../Lab-2/src/repositories/user.repository');
const { openDatabase: productDb } = require('../../Lab-3/src/db');
const { createApp: productApp } = require('../../Lab-3/src/app');
const { openDatabase: orderDb } = require('../../Lab-4/src/db');
const { createApp: orderApp } = require('../../Lab-4/src/app');

test('Reporting tích hợp Lab 2, 3, 4', async t => {
  const dbs = [authDb(':memory:'), productDb(':memory:'), orderDb(':memory:'), openDatabase(':memory:')];
  const servers = [];
  t.after(async () => { for (const server of servers.reverse()) if (server.listening) await new Promise(resolve => server.close(resolve)); for (const db of dbs) db.close(); });
  async function start(app) { const server = app.listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
  createUserRepository(dbs[0]).create('student', await bcrypt.hash('Student@123', 4));
  const authUrl = await start(authApp(dbs[0], { secret: 'reporting-test-secret-at-least-thirty-two-bytes', expiresIn: '1h' }));
  const productUrl = await start(productApp(dbs[1], { authServiceUrl: authUrl, authTimeoutMs: 1000 }));
  const orderUrl = await start(orderApp(dbs[2], { authUrl, productUrl, timeout: 1000 }));
  const base = await start(createApp(dbs[3], { authUrl, productUrl, orderUrl, timeout: 1000 }));
  let token;
  async function request(url, method = 'GET', body, authorization = token) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
  token = (await request(authUrl, 'POST', { userName: 'student', password: Buffer.from('Student@123').toString('base64') })).data.token;
  const product = (await request(productUrl + '/products', 'POST', { name: 'Bàn phím', price: 150000.25, quantity: 10 })).data;
  const second = (await request(productUrl + '/products', 'POST', { name: 'Chuột', price: 50000.1, quantity: 10 })).data;
  const order = (await request(orderUrl + '/orders', 'POST', { customer_name: 'Sinh viên', customer_email: 'a@example.com', items: [{ product_id: product.id, quantity: 2 }, { product_id: second.id, quantity: 1 }] })).data;
  const input = { order_id: order.id, unit_costs: [{ product_id: product.id, unit_cost: 100000.1 }, { product_id: second.id, unit_cost: 60000 }] };
  let report, line;
  await t.test('Giao diện, đăng nhập và API nguồn cùng origin', async () => {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /Báo cáo & thống kê/);
    for (const file of ['app.js', 'style.css']) assert.equal((await fetch(base + '/' + file)).status, 200);
    assert.equal((await request(base + '/ui/login', 'POST', {})).status, 400);
    assert.equal((await request(base + '/ui/login', 'POST', { userName: 'student', password: 'wrong' })).status, 401);
    const login = await request(base + '/ui/login', 'POST', { userName: 'student', password: 'Student@123' });
    assert.equal(login.status, 200);
    assert.ok(login.data.token);
    assert.equal((await request(base + '/ui/orders', 'GET', undefined, '')).status, 401);
    assert.equal((await request(base + '/ui/orders')).data[0].id, order.id);
    assert.equal((await request(base + '/ui/orders/' + order.id)).data.items.length, 2);
    assert.equal((await request(base + '/ui/orders/abc')).status, 400);
    assert.equal((await request(base + '/ui/orders/999')).status, 404);
  });
  await t.test('Xác thực và dữ liệu đầu vào', async () => {
    for (const kind of ['products','orders']) {
      assert.equal((await request(`${base}/reports/${kind}`, 'GET', undefined, '')).status, 401);
      assert.equal((await request(`${base}/reports/${kind}`, 'GET', undefined, 'wrong')).status, 401);
    }
    assert.equal((await request(base + '/reports/orders/abc')).status, 400);
    assert.equal((await request(base + '/reports/orders/999')).status, 404);
    assert.equal((await request(base + '/reports/orders', 'POST', {})).status, 400);
    assert.equal((await request(base + '/reports/orders', 'POST', input)).status, 409);
    await request(orderUrl + '/orders/' + order.id, 'PUT', { status: 'completed' });
    assert.equal((await request(base + '/reports/orders', 'POST', { ...input, unit_costs: input.unit_costs.slice(0,1) })).status, 400);
    assert.equal((await request(base + '/reports/orders')).data.length, 0);
    assert.equal((await request(base + '/reports/products')).data.length, 0);
    assert.equal((await request(base + '/reports/orders', 'POST', { ...input, unit_costs: [{ product_id: product.id, unit_cost: 0.001 }] })).status, 400);
    assert.equal((await request(base + '/reports/orders', 'POST', { ...input, unit_costs: [{ product_id: product.id, unit_cost: 99999999.99 }, input.unit_costs[1]] })).status, 400);
  });
  await t.test('Tính tiền chính xác, giá lịch sử, tồn kho và tạo trùng đồng thời', async () => {
    await request(productUrl + '/products/' + product.id, 'PUT', { name: 'Giá mới', price: 200000, quantity: 8 });
    const results = await Promise.all([request(base + '/reports/orders', 'POST', input), request(base + '/reports/orders', 'POST', input)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201,409]);
    report = results.find(r => r.status === 201).data;
    assert.equal(report.total_revenue, 350000.6);
    assert.equal(report.total_cost, 260000.2);
    assert.equal(report.total_profit, 90000.4);
    const lines = (await request(base + '/reports/products')).data;
    assert.equal(lines.length, 2);
    line = lines.find(row => row.product_id === product.id);
    assert.equal(line.stock_quantity, 8);
    assert.equal(line.product_name, 'Bàn phím');
    assert.equal(line.total_sold, 2);
    assert.equal(lines.find(row => row.product_id === second.id).profit, -9999.9);
    assert.equal((await request(base + '/reports/orders/' + report.id)).data.items.length, 2);
    assert.equal((await request(base + '/reports/products/' + line.id)).status, 200);
  });
  await t.test('Xóa, tái tạo sản phẩm từ bản chụp và cascade', async () => {
    const body = { order_report_id: report.id, product_id: product.id };
    assert.equal((await request(base + '/reports/products', 'POST', body)).status, 409);
    assert.equal((await request(base + '/reports/products/' + line.id, 'DELETE')).status, 204);
    assert.equal((await request(base + '/reports/products/' + line.id)).status, 404);
    assert.equal((await request(base + '/reports/products', 'POST', { ...body, product_id: 999 })).status, 400);
    const restored = await request(base + '/reports/products', 'POST', body);
    assert.equal(restored.status, 201);
    assert.equal(restored.data.revenue, 300000.5);
    assert.equal((await request(base + '/reports/orders/' + report.id, 'DELETE')).status, 204);
    assert.equal((await request(base + '/reports/products')).data.length, 0);
    assert.equal((await request(base + '/reports/orders/' + report.id)).status, 404);
    assert.equal((await request(base + '/reports/orders/' + report.id, 'DELETE')).status, 404);
  });
  await t.test('Tạo báo cáo sản phẩm trực tiếp từ service nguồn', async () => {
    assert.equal((await request(base + '/reports/products', 'POST', { ...input, product_id: 999 })).status, 400);
    const result = await request(base + '/reports/products', 'POST', { ...input, product_id: product.id });
    assert.equal(result.status, 201);
    assert.equal(result.data.total_sold, 2);
    assert.equal((await request(base + '/reports/orders')).data.length, 1);
  });
  await t.test('Không lưu dở khi service nguồn hoặc auth ngừng hoạt động', async () => {
    const saved = (await request(base + '/reports/orders')).data[0];
    await request(base + '/reports/orders/' + saved.id, 'DELETE');
    await new Promise(resolve => servers[1].close(resolve));
    assert.equal((await request(base + '/reports/orders', 'POST', input)).status, 503);
    assert.equal((await request(base + '/reports/orders')).data.length, 0);
    assert.equal((await request(base + '/reports/products')).data.length, 0);
    await new Promise(resolve => servers[2].close(resolve));
    assert.equal((await request(base + '/reports/orders', 'POST', input)).status, 503);
    await new Promise(resolve => servers[0].close(resolve));
    assert.equal((await request(base + '/reports/orders')).status, 503);
  });
});
