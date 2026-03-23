const express = require('express');
const firestore = require('../../firestore');

const router = express.Router();

// GET /api/admin/field-mappings
router.get('/', async (req, res) => {
  try {
    const doc = await firestore.collection('field_mappings').doc('global').get();
    if (!doc.exists) {
      return res.json({ mappings: [] });
    }
    res.json(doc.data());
  } catch (err) {
    console.error('Failed to get field mappings:', err.message);
    res.status(500).json({ error: 'Failed to get field mappings' });
  }
});

// PUT /api/admin/field-mappings
router.put('/', async (req, res) => {
  const { mappings } = req.body;

  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'mappings array is required' });
  }

  try {
    await firestore.collection('field_mappings').doc('global').set({ mappings });
    res.json({ status: 'updated', count: mappings.length });
  } catch (err) {
    console.error('Failed to update field mappings:', err.message);
    res.status(500).json({ error: 'Failed to update field mappings' });
  }
});

module.exports = router;
