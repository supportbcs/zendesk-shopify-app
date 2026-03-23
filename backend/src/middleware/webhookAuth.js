const crypto = require('crypto');
const config = require('../config');

function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-zendesk-webhook-signature'];
  const timestamp = req.headers['x-zendesk-webhook-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing webhook signature headers' });
  }

  const body = req.rawBody || JSON.stringify(req.body);
  const signBody = timestamp + body;
  const expected = crypto
    .createHmac('sha256', config.zendeskWebhookSecret)
    .update(signBody)
    .digest('base64');

  const valid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );

  if (!valid) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

module.exports = { verifyWebhookSignature };
