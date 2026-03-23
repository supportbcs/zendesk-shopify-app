const express = require('express');
const { getCachedOrders, updateSelectedOrder } = require('../services/orderCacheService');
const { getEnabledMappings, buildTicketFields } = require('../services/fieldMappingService');
const { updateTicketFields } = require('../services/zendeskClient');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticketId, orderId } = req.body;

  if (!ticketId || !orderId) {
    return res.status(400).json({ error: 'ticketId and orderId are required' });
  }

  try {
    const cached = await getCachedOrders(String(ticketId));
    if (!cached) {
      return res.status(404).json({ error: 'No cached data for this ticket' });
    }

    const order = cached.orders.find(o => o.shopify_order_id === String(orderId));
    if (!order) {
      return res.status(404).json({ error: 'Order not found in cache' });
    }

    await updateSelectedOrder(String(ticketId), String(orderId));

    const mappings = await getEnabledMappings();
    const fields = buildTicketFields(order, mappings);
    await updateTicketFields(String(ticketId), fields);

    res.json({ status: 'ok', selectedOrderId: orderId });
  } catch (err) {
    console.error(`Select order failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Failed to select order' });
  }
});

module.exports = router;
