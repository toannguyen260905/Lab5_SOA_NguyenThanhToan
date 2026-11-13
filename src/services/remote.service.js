function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function createRemoteService(config) {
  async function get(url, token) {
    try {
      const response = await fetch(url, { headers: { Authorization: token }, signal: AbortSignal.timeout(config.timeout), redirect: 'error' });
      if ([401,403].includes(response.status)) fail(401, 'Token không hợp lệ hoặc hết hạn.');
      if (response.status === 404) fail(404, 'Dữ liệu nguồn không tồn tại.');
      if (!response.ok) fail(503, 'Dịch vụ liên kết không khả dụng.');
      return await response.json();
    } catch (error) {
      if (error.status) throw error;
      fail(503, 'Không kết nối được hoặc dữ liệu dịch vụ liên kết không hợp lệ.');
    }
  }
  return {
    async authenticate(token) {
      const data = await get(`${config.authUrl}/auth`, token);
      if (!Number.isSafeInteger(data?.user?.id) || data.user.id < 1) fail(503, 'Phản hồi xác thực không hợp lệ.');
      return data.user;
    },
    orders: token => get(`${config.orderUrl}/orders`, token),
    order: (id, token) => get(`${config.orderUrl}/orders/${id}`, token),
    product: (id, token) => get(`${config.productUrl}/products/${id}`, token)
  };
}
module.exports = { createRemoteService, fail };
