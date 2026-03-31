const config = require('../config');

function verifyInternalApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const token = authHeader.slice(7);
  if (token !== config.internalApiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

module.exports = { verifyInternalApiKey };
