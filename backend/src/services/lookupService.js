const config = require('../config');
const zendeskClient = require('./zendeskClient');
const storeService = require('./storeService');
const secretManager = require('./secretManager');
const shopifyClient = require('./shopifyClient');
const fieldMappingService = require('./fieldMappingService');
const orderCacheService = require('./orderCacheService');
const { logger } = require('../logger');
const lookupLogger = logger.child({ component: 'lookup' });

function isNameAutoDerived(name, email) {
  const localPart = email.split('@')[0];
  return name.toLowerCase() === localPart.toLowerCase();
}

function hasWrongCapitalization(name) {
  const parts = name.trim().split(/\s+/);
  return parts.some(part => part.length > 0 && part[0] !== part[0].toUpperCase());
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildProperName(firstName, lastName) {
  return [capitalize(firstName), capitalize(lastName)].filter(Boolean).join(' ');
}

function hasInitialFirstName(name) {
  const firstName = name.trim().split(/\s+/)[0];
  return firstName.length === 1;
}

function needsNameUpdate(currentName, email) {
  return isNameAutoDerived(currentName, email) || hasWrongCapitalization(currentName) || hasInitialFirstName(currentName);
}

async function tryUpdateRequesterName(requesterId, currentName, email, orders) {
  if (orders.length === 0) return undefined;

  const mostRecent = orders[0];
  const firstName = mostRecent.customer_first_name;
  const lastName = mostRecent.customer_last_name;

  if (!firstName && !lastName) return undefined;
  if (!needsNameUpdate(currentName, email)) return undefined;

  const properName = buildProperName(firstName, lastName);

  await zendeskClient.updateUser(requesterId, { name: properName });
  lookupLogger.info('Updated requester name', {
    requesterId,
    oldName: currentName,
    newName: properName,
  });

  return `${currentName} -> ${properName}`;
}

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
      storeId: store.id,
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
    shopifyDomain: store.shopify_domain,
    customerEmails,
    orders: allOrders,
  });

  // Update requester name if needed
  let requesterUpdated;
  if (allOrders.length > 0) {
    const user = await zendeskClient.getUser(ticket.requesterId);
    requesterUpdated = await tryUpdateRequesterName(
      ticket.requesterId, user.name, user.email, allOrders
    );
  }

  if (allOrders.length > 0) {
    const mappings = await fieldMappingService.getEnabledMappings();
    const fields = fieldMappingService.buildTicketFields(allOrders[0], mappings);
    await zendeskClient.updateTicketFields(String(ticketId), fields);
  }

  const result = {
    ticketId,
    storeName: store.store_name,
    ordersFound: allOrders.length,
  };

  if (requesterUpdated) {
    result.requesterUpdated = requesterUpdated;
  }

  return result;
}

module.exports = { lookupOrdersForTicket };
