const express = require('express');
const firestore = require('../../firestore');

const router = express.Router();

// GET /api/admin/webhook-logs — returns last 100 webhook logs
router.get('/', async (req, res) => {
  try {
    const snapshot = await firestore
      .collection('webhook_logs')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Compute summary stats
    const successCount = logs.filter(l => l.status === 'success').length;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const warningCount = logs.filter(l => l.status === 'warning').length;

    res.json({
      logs,
      summary: {
        total: logs.length,
        success: successCount,
        error: errorCount,
        warning: warningCount,
      },
    });
  } catch (err) {
    console.error('Failed to get webhook logs:', err.message);
    res.status(500).json({ error: 'Failed to get webhook logs' });
  }
});

module.exports = router;
