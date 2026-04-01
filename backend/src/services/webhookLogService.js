const firestore = require('../firestore');

const COLLECTION = 'webhook_logs';
const MAX_LOGS = 100;

async function logWebhookCall({ ticketId, storeName, status, durationMs, ordersFound, error, requesterUpdated }) {
  const entry = {
    ticket_id: String(ticketId),
    store_name: storeName || null,
    status,
    duration_ms: durationMs,
    orders_found: ordersFound || 0,
    error: error || null,
    requester_updated: requesterUpdated || null,
    timestamp: new Date().toISOString(),
  };

  await firestore.collection(COLLECTION).add(entry);

  pruneOldLogs().catch(err =>
    console.warn('Failed to prune webhook logs:', err.message)
  );
}

async function pruneOldLogs() {
  const countSnap = await firestore.collection(COLLECTION).count().get();
  const totalCount = countSnap.data().count;

  if (totalCount <= MAX_LOGS) return;

  const toDelete = totalCount - MAX_LOGS;
  const oldDocs = await firestore
    .collection(COLLECTION)
    .orderBy('timestamp', 'asc')
    .limit(toDelete)
    .get();

  const batch = firestore.batch();
  oldDocs.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

module.exports = { logWebhookCall };
