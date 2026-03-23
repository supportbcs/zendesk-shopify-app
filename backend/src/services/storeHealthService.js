const firestore = require('../firestore');
const { logger } = require('../logger');

async function recordSuccess(storeId) {
  try {
    await firestore.collection('stores').doc(storeId).set(
      {
        last_successful_sync: new Date().toISOString(),
        last_error: null,
      },
      { merge: true }
    );
  } catch (err) {
    // Don't let health recording failures break the main flow
    logger.error('Failed to record store health success', {
      storeId,
      error: err.message,
    });
  }
}

async function recordError(storeId, errorMessage) {
  try {
    await firestore.collection('stores').doc(storeId).set(
      {
        last_error: {
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      },
      { merge: true }
    );
  } catch (err) {
    logger.error('Failed to record store health error', {
      storeId,
      error: err.message,
    });
  }
}

module.exports = { recordSuccess, recordError };
