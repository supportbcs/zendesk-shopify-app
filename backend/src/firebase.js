const admin = require('firebase-admin');

// On Cloud Run, Application Default Credentials are automatic.
// Locally, run: gcloud auth application-default login
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

module.exports = admin;
