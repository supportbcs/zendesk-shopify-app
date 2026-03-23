const express = require('express');
const firestore = require('../../firestore');
const secretManager = require('../../services/secretManager');
const shopifyClient = require('../../services/shopifyClient');
const config = require('../../config');
const { logger } = require('../../logger');
const adminLogger = logger.child({ component: 'admin-stores' });

const router = express.Router();

// GET /api/admin/stores — list all stores
router.get('/', async (req, res) => {
  try {
    const snapshot = await firestore.collection('stores').orderBy('store_name').get();
    const stores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ stores });
  } catch (err) {
    adminLogger.error('Failed to list stores', { error: err.message });
    res.status(500).json({ error: 'Failed to list stores' });
  }
});

// POST /api/admin/stores — create a new store
router.post('/', async (req, res) => {
  const { store_name, shopify_domain, api_token } = req.body;

  if (!store_name || !shopify_domain || !api_token) {
    return res.status(400).json({ error: 'store_name, shopify_domain, and api_token are required' });
  }

  const docId = store_name.toLowerCase();

  try {
    // Check if store already exists
    const existing = await firestore.collection('stores').doc(docId).get();
    if (existing.exists) {
      return res.status(409).json({ error: 'Store already exists' });
    }

    // Store API token in Secret Manager
    const secretId = 'shopify-' + docId;
    const secretName = await secretManager.createSecret(secretId, api_token);

    // Create Firestore document
    await firestore.collection('stores').doc(docId).set({
      store_name,
      shopify_domain,
      secret_name: secretName,
      is_active: true,
      last_successful_sync: null,
      last_error: null,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ id: docId, store_name, shopify_domain });
  } catch (err) {
    adminLogger.error('Failed to create store', { error: err.message });
    res.status(500).json({ error: 'Failed to create store' });
  }
});

// PUT /api/admin/stores/:id — update a store
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { store_name, shopify_domain, api_token, is_active } = req.body;

  try {
    const docRef = firestore.collection('stores').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const updates = {};
    if (store_name !== undefined) updates.store_name = store_name;
    if (shopify_domain !== undefined) updates.shopify_domain = shopify_domain;
    if (is_active !== undefined) updates.is_active = is_active;

    // If a new API token is provided, update it in Secret Manager
    if (api_token) {
      const secretId = 'shopify-' + id;
      await secretManager.updateSecret(secretId, api_token);
    }

    if (Object.keys(updates).length > 0) {
      await docRef.set(updates, { merge: true });
    }

    res.json({ id, ...updates });
  } catch (err) {
    adminLogger.error('Failed to update store', { error: err.message });
    res.status(500).json({ error: 'Failed to update store' });
  }
});

// DELETE /api/admin/stores/:id — delete a store
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const docRef = firestore.collection('stores').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Delete secret from Secret Manager
    const secretId = 'shopify-' + id;
    await secretManager.deleteSecret(secretId);

    // Delete Firestore document
    await docRef.delete();

    res.json({ status: 'deleted', id });
  } catch (err) {
    adminLogger.error('Failed to delete store', { error: err.message });
    res.status(500).json({ error: 'Failed to delete store' });
  }
});

// POST /api/admin/stores/:id/test — test connection to Shopify
router.post('/:id/test', async (req, res) => {
  const { id } = req.params;

  try {
    const doc = await firestore.collection('stores').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const store = doc.data();
    const apiToken = await secretManager.getSecret(store.secret_name);

    // Make a test API call to Shopify (fetch orders for a non-existent email)
    await shopifyClient.getOrdersByEmail({
      shopifyDomain: store.shopify_domain,
      apiToken,
      apiVersion: config.shopifyApiVersion,
      email: 'connection-test@backbonecustomerservice.com',
    });

    res.json({ success: true, message: 'Connection successful' });
  } catch (err) {
    res.json({ success: false, message: 'Connection failed: ' + err.message });
  }
});

module.exports = router;
