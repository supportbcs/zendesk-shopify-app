const express = require('express');

const router = express.Router();

router.post('/verify', (req, res) => {
  // If adminAuth middleware passed, user is verified and whitelisted
  res.json({
    uid: req.adminUser.uid,
    email: req.adminUser.email,
    name: req.adminUser.name,
  });
});

module.exports = router;
