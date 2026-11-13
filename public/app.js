const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 2 }).format(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = sessionStorage.getItem('reportToken') || '';
let userName = sessionStorage.getItem('reportUser') || '';
let view = 'orders', orders = [], products = [], sourceOrder = null, pendingDelete = null;
let selectionVersion = 0, loadVersion = 0;
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function logout() {
  token = ''; userName = ''; sessionStorage.removeItem('reportToken'); sessionStorage.removeItem('reportUser');
  loadVersion++; selectionVersion++; orders = []; products = []; sourceOrder = null;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  render();
}
async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); }
  catch { throw new Error('Không kết nối được máy chủ. Kiểm tra Lab 5 đang chạy.'); }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== '/ui/login') { logout(); notice('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); }
    throw new Error(data?.message || 'Không thực hiện được yêu cầu.');
  }
  return data;
}
function render() {
  $('account').textContent = token ? `${userName} · Đăng xuất` : 'Đăng nhập';
  const sum = key => orders.reduce((total, row) => total + Math.round(row[key] * 100), 0) / 100;
  $('revenue').textContent = token ? money(sum('total_revenue')) : '—';
  $('cost').textContent = token ? money(sum('total_cost')) : '—';
  $('profit').textContent = token ? money(sum('total_profit')) : '—';
  $('count').textContent = token ? orders.length : '—';
  const isOrders = view === 'orders';
  $('table-title').textContent = isOrders ? 'Báo cáo đơn hàng' : 'Báo cáo sản phẩm';
  $('table-subtitle').textContent = isOrders ? 'Bản chụp kết quả kinh doanh theo từng đơn hàng.' : 'Doanh số và tồn kho của sản phẩm trong từng đơn hàng.';
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const query = $('search').value.trim().toLocaleLowerCase('vi');
  const rows = (isOrders ? orders : products).filter(row => [row.id, row.order_id, row.order_report_id, row.product_id, row.product_name].some(value => String(value ?? '').toLocaleLowerCase('vi').includes(query)));
  $('table-head').innerHTML = `<tr>${(isOrders ? ['BÁO CÁO / ĐƠN HÀNG','DOANH THU','CHI PHÍ','LỢI NHUẬN','THAO TÁC'] : ['SẢN PHẨM / BÁO CÁO ĐƠN','ĐÃ BÁN','TỒN KHO','DOANH THU','LỢI NHUẬN','THAO TÁC']).map(label => `<th>${label}</th>`).join('')}</tr>`;
  $('table-body').innerHTML = rows.map(row => {
    const profit = isOrders ? row.total_profit : row.profit;
    const cells = isOrders
      ? `<td><b>#BC${row.id}</b> <span class="badge">Đơn #${row.order_id}</span></td><td class="money">${money(row.total_revenue)}</td><td class="money">${money(row.total_cost)}</td>`
      : `<td><b>${esc(row.product_name)}</b><br><small>SP #${row.product_id} · BC đơn #${row.order_report_id}</small></td><td>${row.total_sold}</td><td>${row.stock_quantity}</td><td class="money">${money(row.revenue)}</td>`;
    return `<tr>${cells}<td class="money ${profit < 0 ? 'negative' : 'positive'}">${money(profit)}</td><td><button class="row-action" data-detail="${row.id}" aria-label="Xem báo cáo ${row.id}">Chi tiết</button><button class="row-action delete" data-delete="${row.id}" aria-label="Xóa báo cáo ${row.id}">Xóa</button></td></tr>`;
  }).join('');
  $('empty').hidden = rows.length > 0;
  $('empty').querySelector('h3').textContent = !token ? 'Chào mừng đến với Reporting' : query ? 'Không tìm thấy báo cáo' : 'Chưa có báo cáo nào';
  $('empty').querySelector('p').textContent = !token ? 'Đăng nhập để xem và tạo báo cáo kinh doanh của bạn.' : query ? 'Thử tìm theo mã báo cáo, mã đơn hoặc tên sản phẩm khác.' : 'Tạo báo cáo từ đơn đã hoàn thành để bắt đầu theo dõi.';
  $('empty-action').textContent = token ? '＋ Tạo báo cáo đầu tiên' : 'Đăng nhập để bắt đầu →';
  $('empty-action').hidden = !!query && !!token;
  $('result-count').textContent = token ? `${rows.length} báo cáo${query ? ' phù hợp' : ''}` : 'Chưa tải dữ liệu';
}
async function load() {
  if (!token) { render(); return; }
  const version = ++loadVersion;
  $('refresh').disabled = true;
  try {
    const results = await Promise.all([api('/reports/orders'), api('/reports/products')]);
    if (version !== loadVersion || !token) return;
    [orders, products] = results; notice(); render();
  } catch (error) { notice(error.message); }
  finally { $('refresh').disabled = false; }
}
function openLogin() { $('login-error').textContent = ''; $('login-dialog').showModal(); }
async function openCreate() {
  if (!token) return openLogin();
  sourceOrder = null; selectionVersion++;
  $('create-error').textContent = ''; $('cost-inputs').replaceChildren(); $('create-submit').disabled = true;
  $('order-select').innerHTML = '<option value="">Đang tải đơn hàng…</option>';
  $('create-dialog').showModal();
  try {
    const list = await api('/ui/orders');
    const available = list.filter(row => row.status === 'completed' && !orders.some(report => report.order_id === row.id));
    $('order-select').innerHTML = `<option value="">${available.length ? 'Chọn đơn hàng đã hoàn thành' : 'Không có đơn hoàn thành chưa lập báo cáo'}</option>` + available.map(row => `<option value="${row.id}">Đơn #${row.id} · ${esc(row.customer_name)} · ${money(row.total_amount)}</option>`).join('');
    if (!available.length) $('create-error').textContent = 'Hãy tạo và hoàn thành đơn hàng ở Lab 4 trước, sau đó mở lại cửa sổ này.';
  } catch (error) { $('create-error').textContent = error.message; }
}
$('order-select').addEventListener('change', async event => {
  const version = ++selectionVersion;
  sourceOrder = null; $('cost-inputs').replaceChildren(); $('create-submit').disabled = true; $('create-error').textContent = '';
  if (!event.target.value) return;
  try {
    const order = await api(`/ui/orders/${event.target.value}`);
    if (version !== selectionVersion) return;
    sourceOrder = order;
    $('cost-inputs').innerHTML = order.items.map(item => `<div class="cost-row"><label>${esc(item.product_name)} · SP #${item.product_id}<input type="number" data-cost="${item.product_id}" min="0" max="99999999.99" step="0.01" required placeholder="Giá vốn mỗi đơn vị (₫)"></label><small>Số lượng: ${item.quantity} · Giá bán: ${money(item.unit_price)}</small></div>`).join('');
    $('create-submit').disabled = !order.items.length;
  } catch (error) { if (version === selectionVersion) $('create-error').textContent = error.message; }
});
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('login-error').textContent = '';
  try {
    const form = new FormData(event.target);
    const data = await api('/ui/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
    token = data.token; userName = data.userName; sessionStorage.setItem('reportToken', token); sessionStorage.setItem('reportUser', userName);
    $('login-dialog').close(); event.target.reset(); await load();
  } catch (error) { $('login-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('create-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!sourceOrder) return;
  $('create-submit').disabled = true; $('create-error').textContent = '';
  try {
    await api('/reports/orders', { method: 'POST', body: JSON.stringify({ order_id: sourceOrder.id, unit_costs: [...document.querySelectorAll('[data-cost]')].map(input => ({ product_id: Number(input.dataset.cost), unit_cost: Number(input.value) })) }) });
    $('create-dialog').close(); $('search').value = ''; await load();
  } catch (error) { $('create-error').textContent = error.message; }
  finally { $('create-submit').disabled = !sourceOrder; }
});
function detailMarkup(row, kind) {
  const isOrder = kind === 'orders';
  const values = isOrder ? [['Báo cáo', `#BC${row.id} / Đơn #${row.order_id}`], ['Doanh thu', money(row.total_revenue)], ['Chi phí', money(row.total_cost)], ['Lợi nhuận', money(row.total_profit)]] : [['Sản phẩm', row.product_name], ['Báo cáo đơn', `#${row.order_report_id}`], ['Đã bán / Tồn kho', `${row.total_sold} / ${row.stock_quantity}`], ['Doanh thu', money(row.revenue)], ['Chi phí', money(row.cost)], ['Lợi nhuận', money(row.profit)]];
  let html = `<div class="detail-grid">${values.map(([label,value]) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  if (isOrder) html += '<h3>Sản phẩm trong bản chụp gốc</h3>' + row.items.map(item => {
    const exists = products.some(product => product.order_report_id === row.id && product.product_id === item.product_id);
    return `<div class="detail-item"><h3>${esc(item.product_name)}</h3><p>SL: ${item.total_sold} · Tồn: ${item.stock_quantity}<br>Doanh thu: ${money(item.revenue)} · Chi phí: ${money(item.cost)}<br>Lợi nhuận: ${money(item.profit)}</p>${exists ? '' : `<button class="row-action" data-restore="${item.product_id}" data-parent="${row.id}">↻ Khôi phục báo cáo sản phẩm</button>`}</div>`;
  }).join('');
  return html;
}
$('table-body').addEventListener('click', async event => {
  const detail = event.target.closest('[data-detail]');
  const remove = event.target.closest('[data-delete]');
  if (detail) {
    detail.disabled = true;
    try { const row = await api(`/reports/${view}/${detail.dataset.detail}`); $('detail-content').innerHTML = detailMarkup(row, view); $('detail-dialog').showModal(); }
    catch (error) { notice(error.message); } finally { detail.disabled = false; }
  }
  if (remove) {
    pendingDelete = { kind: view, id: Number(remove.dataset.delete) };
    $('delete-description').textContent = view === 'orders' ? 'Báo cáo đơn và tất cả báo cáo sản phẩm liên quan sẽ bị xóa. Dữ liệu đơn hàng gốc được giữ nguyên.' : 'Dòng báo cáo sản phẩm sẽ bị xóa. Bạn có thể khôi phục từ chi tiết báo cáo đơn hàng.';
    $('delete-error').textContent = ''; $('delete-dialog').showModal();
  }
});
$('delete-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!pendingDelete) return;
  const button = event.submitter; button.disabled = true;
  try { await api(`/reports/${pendingDelete.kind}/${pendingDelete.id}`, { method: 'DELETE' }); pendingDelete = null; $('delete-dialog').close(); await load(); }
  catch (error) { $('delete-error').textContent = error.message; } finally { button.disabled = false; }
});
$('detail-content').addEventListener('click', async event => {
  const button = event.target.closest('[data-restore]'); if (!button) return; button.disabled = true;
  try { await api('/reports/products', { method: 'POST', body: JSON.stringify({ order_report_id: Number(button.dataset.parent), product_id: Number(button.dataset.restore) }) }); $('detail-dialog').close(); await load(); }
  catch (error) { $('detail-dialog').close(); notice(error.message); } finally { button.disabled = false; }
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; $('search').value = ''; render(); }));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
$('account').addEventListener('click', () => token ? logout() : openLogin());
$('empty-action').addEventListener('click', () => token ? openCreate() : openLogin());
$('new-report').addEventListener('click', openCreate);
$('refresh').addEventListener('click', () => token ? load() : openLogin());
$('search').addEventListener('input', render);
render(); load();
