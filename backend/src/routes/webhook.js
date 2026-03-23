const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');
const { logWebhookCall } = require('../services/webhookLogService');
const { logger } = require('../logger');

const webhookLogger = logger.child({ component: 'webhook' });

const router = express.Router();

router.post('/ticket-created', async (req, res) => {
  const ticketId = req.body.ticket_id;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  const startTime = Date.now();
  webhookLogger.info('Webhook received', { ticketId });

  try {
    const result = await lookupOrdersForTicket(String(ticketId));
    const durationMs = Date.now() - startTime;

    if (result.error) {
      webhookLogger.warn('Lookup completed with warning', {
        ticketId,
        error: result.error,
        durationMs,
      });

      await logWebhookCall({
        ticketId: String(ticketId),
        storeName: result.storeName || 'unknown',
        status: 'warning',
        durationMs,
        ordersFound: 0,
        error: result.error,
      }).catch(() => {}); // Don't let log failure crash the webhook
    } else {
      webhookLogger.info('Lookup completed', {
        ticketId,
        storeName: result.storeName,
        ordersFound: result.ordersFound,
        durationMs,
      });

      await logWebhookCall({
        ticketId: String(ticketId),
        storeName: result.storeName,
        status: 'success',
        durationMs,
        ordersFound: result.ordersFound,
        error: null,
      }).catch(() => {}); // Don't let log failure crash the webhook
    }

    res.json({ status: 'ok', ...result });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    webhookLogger.error('Lookup failed', {
      ticketId,
      error: err.message,
      durationMs,
    });

    await logWebhookCall({
      ticketId: String(ticketId),
      storeName: 'unknown',
      status: 'error',
      durationMs,
      ordersFound: 0,
      error: err.message,
    }).catch(() => {}); // Don't let log failure crash the webhook

    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
