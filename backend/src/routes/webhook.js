const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');
const { logWebhookCall } = require('../services/webhookLogService');

const router = express.Router();

router.post('/ticket-created', async (req, res) => {
  const ticketId = req.body.ticket_id;
  const startTime = Date.now();

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  try {
    const result = await lookupOrdersForTicket(String(ticketId));
    const durationMs = Date.now() - startTime;

    logWebhookCall({
      ticketId,
      storeName: result.storeName || null,
      status: result.error ? 'warning' : 'success',
      durationMs,
      ordersFound: result.ordersFound || 0,
      error: result.error || null,
    }).catch(err => console.warn('Failed to log webhook call:', err.message));

    if (result.error) {
      console.warn(`Webhook lookup warning for ticket ${ticketId}: ${result.error}`);
    }

    res.json({ status: 'ok', ...result });
  } catch (err) {
    const durationMs = Date.now() - startTime;

    logWebhookCall({
      ticketId,
      storeName: null,
      status: 'error',
      durationMs,
      ordersFound: 0,
      error: err.message,
    }).catch(logErr => console.warn('Failed to log webhook error:', logErr.message));

    console.error(`Webhook lookup failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
