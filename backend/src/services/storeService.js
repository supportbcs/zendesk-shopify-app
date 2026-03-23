const firestore = require('../firestore');

async function getStoreByName(storeName) {
  const docId = storeName.toLowerCase();
  const doc = await firestore.collection('stores').doc(docId).get();

  if (!doc.exists) return null;

  const data = doc.data();
  if (!data.is_active) return null;

  return { id: doc.id, ...data };
}

module.exports = { getStoreByName };
