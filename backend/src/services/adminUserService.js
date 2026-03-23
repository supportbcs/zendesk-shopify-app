const firestore = require('../firestore');

async function isEmailAllowed(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  const doc = await firestore.collection('admin_users').doc(normalizedEmail).get();
  return doc.exists;
}

module.exports = { isEmailAllowed };
