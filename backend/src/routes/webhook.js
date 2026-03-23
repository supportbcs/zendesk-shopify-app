const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');

const router = express.Router();

router.post('/ticket-created', async (req, res) => {
  const ticketId = req.body.ticket_id;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  try {
    const result = await lookupOrdersForTicket(String(ticketId));

    if (result.error) {
      console.warn(`Webhook lookup warning for ticket ${ticketId}: ${result.error}`);
    }

    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error(`Webhook lookup failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
