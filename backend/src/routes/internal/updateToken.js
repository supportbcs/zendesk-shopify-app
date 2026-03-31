const express = require('express');
const firestore = require('../../firestore');
const secretManager = require('../../services/secretManager');
const { logger } = require('../../logger');

const internalLogger = logger.child({ component: 'internal-update-token' });

const router = express.Router();

router.post('/', async (req, res) => {
  const { shopify_domain, shpat } = req.body;

  if (!shopify_domain || !shpat) {
    return res.status(400).json({ error: 'shopify_domain and shpat are required' });
  }

  try {
    // Look up store by shopify_domain
    const snapshot = await firestore
      .collection('stores')
      .where('shopify_domain', '==', shopify_domain)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'No store found for domain: ' + shopify_domain });
    }

    const doc = snapshot.docs[0];
    const store = doc.data();
    const secretId = 'shopify-' + doc.id;

    // Update the token in Secret Manager
    await secretManager.updateSecret(secretId, shpat);

    internalLogger.info('Token updated via internal API', {
      storeId: doc.id,
      storeName: store.store_name,
      shopifyDomain: shopify_domain,
    });

    res.json({
      success: true,
      storeId: doc.id,
      storeName: store.store_name,
    });
  } catch (err) {
    internalLogger.error('Failed to update token', {
      shopifyDomain: shopify_domain,
      error: err.message,
    });
    res.status(500).json({ error: 'Failed to update token' });
  }
});

module.exports = router;
