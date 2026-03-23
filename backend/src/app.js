const express = require('express');
const { verifyWebhookSignature } = require('./middleware/webhookAuth');
const { verifyZafToken } = require('./middleware/zafAuth');
const webhookRouter = require('./routes/webhook');

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

  return app;
}

module.exports = createApp;
