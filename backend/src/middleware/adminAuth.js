const admin = require('../firebase');
const { isEmailAllowed } = require('../services/adminUserService');

async function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    if (!decoded.email || !decoded.email_verified) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    const allowed = await isEmailAllowed(decoded.email);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied: email not authorized' });
    }

    req.adminUser = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || '',
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

module.exports = { verifyAdminToken };
