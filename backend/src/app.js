const express = require('express');
const { verifyWebhookSignature } = require('./middleware/webhookAuth');
const { verifyZafToken } = require('./middleware/zafAuth');
const { verifyAdminToken } = require('./middleware/adminAuth');
const webhookRouter = require('./routes/webhook');
const ordersRouter = require('./routes/orders');
const lookupRouter = require('./routes/lookup');
const selectOrderRouter = require('./routes/selectOrder');
const adminAuthRouter = require('./routes/admin/auth');
const adminStoresRouter = require('./routes/admin/stores');

function createApp() {
  const app = express();

  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/webhook', verifyWebhookSignature, webhookRouter);
  app.use('/api/orders', verifyZafToken, ordersRouter);
  app.use('/api/lookup', verifyZafToken, lookupRouter);
  app.use('/api/select-order', verifyZafToken, selectOrderRouter);

  // Admin routes (authenticated via Firebase token + email whitelist)
  app.use('/api/admin/auth', verifyAdminToken, adminAuthRouter);
  app.use('/api/admin/stores', verifyAdminToken, adminStoresRouter);

  return app;
}

module.exports = createApp;
