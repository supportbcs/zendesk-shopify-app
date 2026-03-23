const firestore = require('../firestore');

async function getCachedOrders(ticketId) {
  const doc = await firestore.collection('ticket_orders').doc(String(ticketId)).get();
  if (!doc.exists) return null;
  return doc.data();
}

async function cacheOrders({ ticketId, storeName, customerEmails, orders }) {
  const selectedOrderId = orders.length > 0 ? orders[0].shopify_order_id : null;

  await firestore.collection('ticket_orders').doc(String(ticketId)).set(
    {
      ticket_id: String(ticketId),
      store_name: storeName,
      customer_emails: customerEmails,
      selected_order_id: selectedOrderId,
      last_synced: new Date().toISOString(),
      orders,
    },
    { merge: true }
  );
}

async function updateSelectedOrder(ticketId, orderId) {
  await firestore.collection('ticket_orders').doc(String(ticketId)).set(
    { selected_order_id: String(orderId) },
    { merge: true }
  );
}

module.exports = { getCachedOrders, cacheOrders, updateSelectedOrder };
