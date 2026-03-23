const express = require('express');
const { getCachedOrders } = require('../services/orderCacheService');

const router = express.Router();

router.get('/', async (req, res) => {
  const { ticketId } = req.query;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticketId query parameter is required' });
  }

  try {
    const data = await getCachedOrders(String(ticketId));

    if (!data) {
      return res.status(404).json({ error: 'No cached data for this ticket' });
    }

    res.json(data);
  } catch (err) {
    console.error(`Failed to get orders for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

module.exports = router;
