const { fail } = require('../services/remote.service');
function createAuthMiddleware(remote) {
  return async (req, res, next) => {
    const token = req.get('Authorization');
    if (!token || !/^Bearer \S+$/i.test(token)) fail(401, 'Cần Authorization: Bearer <token>.');
    req.user = await remote.authenticate(token);
    next();
  };
}
module.exports = { createAuthMiddleware };
