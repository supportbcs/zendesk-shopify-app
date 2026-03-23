const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  try {
    const result = await lookupOrdersForTicket(String(ticketId));
    res.json(result);
  } catch (err) {
    console.error(`Manual lookup failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
