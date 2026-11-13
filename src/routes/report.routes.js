const { Router } = require('express');
const { fail } = require('../services/remote.service');
function createReportRouter(controller, authenticate) {
  const router = Router();
  router.use(authenticate);
  router.param('id', (req, res, next, value) => {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, 'ID phải là số nguyên dương an toàn.');
    req.recordId = Number(value); next();
  });
  for (const kind of ['orders', 'products']) {
    router.get(`/${kind}`, controller.list(kind));
    router.get(`/${kind}/:id`, controller.detail(kind));
    router.delete(`/${kind}/:id`, controller.remove(kind));
  }
  router.post('/orders', controller.createOrder);
  router.post('/products', controller.createProduct);
  return router;
}
module.exports = { createReportRouter };
