const firestore = require('../firestore');
const { logger } = require('../logger');

const BATCH_SIZE = 100;

async function cleanupOldCache({ retentionDays = 90 } = {}) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoff = cutoffDate.toISOString();

  let totalDeleted = 0;

  logger.info('Starting cache cleanup', { retentionDays, cutoff });

  // Process in batches to avoid memory issues with large result sets
  let hasMore = true;
  while (hasMore) {
    const snapshot = await firestore
      .collection('ticket_orders')
      .where('last_synced', '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    totalDeleted += snapshot.docs.length;

    logger.info('Deleted batch', { batchSize: snapshot.docs.length, totalDeleted });
  }

  logger.info('Cache cleanup complete', { totalDeleted });
  return { deleted: totalDeleted };
}

module.exports = { cleanupOldCache };
