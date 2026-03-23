const config = require('../config');
const zendeskClient = require('./zendeskClient');
const storeService = require('./storeService');
const secretManager = require('./secretManager');
const shopifyClient = require('./shopifyClient');
const fieldMappingService = require('./fieldMappingService');
const orderCacheService = require('./orderCacheService');

async function lookupOrdersForTicket(ticketId, { emails: overrideEmails } = {}) {
  const ticket = await zendeskClient.getTicket(ticketId);

  if (!ticket.storeName) {
    return { error: 'no_store_name', ticketId };
  }

  const store = await storeService.getStoreByName(ticket.storeName);
  if (!store) {
    return { error: 'store_not_found', ticketId, storeName: ticket.storeName };
  }

  const customerEmails = overrideEmails ||
    await zendeskClient.getUserEmails(ticket.requesterId);

  const apiToken = await secretManager.getSecret(store.secret_name);

  const orderMap = new Map();
  for (const email of customerEmails) {
    const orders = await shopifyClient.getOrdersByEmail({
      shopifyDomain: store.shopify_domain,
      apiToken,
      apiVersion: config.shopifyApiVersion,
      email,
    });
    for (const order of orders) {
      orderMap.set(order.shopify_order_id, order);
    }
  }

  const allOrders = Array.from(orderMap.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  await orderCacheService.cacheOrders({
    ticketId: String(ticketId),
    storeName: store.store_name,
    customerEmails,
    orders: allOrders,
  });

  if (allOrders.length > 0) {
    const mappings = await fieldMappingService.getEnabledMappings();
    const fields = fieldMappingService.buildTicketFields(allOrders[0], mappings);
    await zendeskClient.updateTicketFields(String(ticketId), fields);
  }

  return {
    ticketId,
    storeName: store.store_name,
    ordersFound: allOrders.length,
  };
}

module.exports = { lookupOrdersForTicket };
