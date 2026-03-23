# Increment 3: Admin Web UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based admin dashboard where Jeff and Redona can manage store connections, configure field mappings, and monitor webhook health — without touching Firestore directly.

**Architecture:** Two parts: (1) Express admin API routes protected by Firebase Auth + email whitelist, added to the existing Cloud Run backend; (2) React SPA built with Vite, served as static files from the same Express service. Google sign-in (popup) on the frontend, Firebase ID token verification on the backend.

**Tech Stack:** React 18, Vite, React Router, Firebase Auth (client), firebase-admin (server), Jest + supertest (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-22-zendesk-shopify-integration-design.md`

---

## Prerequisites

Before starting, ensure:
- **Increment 1 backend** is deployed and working
- **Firebase project** created (or GCP project upgraded to Firebase) — go to [Firebase Console](https://console.firebase.google.com/) and add a web app
- **Google sign-in provider** enabled in Firebase Console → Authentication → Sign-in method
- **Firebase web app config** noted (apiKey, authDomain, projectId) — from Firebase Console → Project Settings → Your apps
- **Cloud Run service account** has `Firebase Authentication Admin` role in IAM
- Node.js 20+ and npm installed

---

## File Structure

New and modified files (relative to project root):

```
backend/
├── src/
│   ├── app.js                        # Modified: serve admin UI + mount admin routes
│   ├── firebase.js                   # New: firebase-admin initialization
│   ├── middleware/
│   │   └── adminAuth.js              # New: Firebase token + whitelist check
│   ├── services/
│   │   ├── secretManager.js          # Modified: add create/update operations
│   │   └── adminUserService.js       # New: whitelist lookups
│   └── routes/
│       └── admin/
│           ├── auth.js               # New: POST /api/admin/auth/verify
│           ├── stores.js             # New: CRUD /api/admin/stores
│           ├── fieldMappings.js      # New: GET/PUT /api/admin/field-mappings
│           └── webhookLogs.js        # New: GET /api/admin/webhook-logs
├── tests/
│   ├── middleware/
│   │   └── adminAuth.test.js         # New
│   └── routes/
│       └── admin/
│           ├── auth.test.js          # New
│           ├── stores.test.js        # New
│           ├── fieldMappings.test.js  # New
│           └── webhookLogs.test.js   # New
├── admin/                            # New: React frontend (Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── firebase.js               # Firebase client config
│       ├── contexts/
│       │   └── AuthContext.jsx
│       ├── hooks/
│       │   └── useAuthFetch.js
│       ├── components/
│       │   ├── ProtectedRoute.jsx
│       │   └── Layout.jsx
│       └── pages/
│           ├── LoginPage.jsx
│           ├── StoresPage.jsx
│           ├── FieldMappingsPage.jsx
│           └── WebhookLogsPage.jsx
├── Dockerfile                        # Modified: multi-stage build
└── package.json                      # Modified: add firebase-admin dependency
```

---

## Task 1: Firebase Admin SDK Setup

**Files:**
- Create: `backend/src/firebase.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Install firebase-admin**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend
npm install firebase-admin
```

- [ ] **Step 2: Create firebase-admin initialization module**

`backend/src/firebase.js`:
```js
const admin = require('firebase-admin');

// On Cloud Run, Application Default Credentials are automatic.
// Locally, run: gcloud auth application-default login
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

module.exports = admin;
```

- [ ] **Step 3: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/firebase.js backend/package.json backend/package-lock.json
git commit -m "feat: add firebase-admin SDK initialization"
```

---

## Task 2: Admin Auth Middleware

**Files:**
- Create: `backend/src/middleware/adminAuth.js`
- Create: `backend/src/services/adminUserService.js`
- Create: `backend/tests/middleware/adminAuth.test.js`

Verifies Firebase ID tokens and checks the user's email against the `admin_users` Firestore collection.

- [ ] **Step 1: Write the admin user service**

`backend/src/services/adminUserService.js`:
```js
const firestore = require('../firestore');

async function isEmailAllowed(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  const doc = await firestore.collection('admin_users').doc(normalizedEmail).get();
  return doc.exists;
}

module.exports = { isEmailAllowed };
```

- [ ] **Step 2: Write the failing test**

`backend/tests/middleware/adminAuth.test.js`:
```js
jest.mock('../../src/firebase', () => {
  const verifyIdToken = jest.fn();
  return {
    auth: () => ({ verifyIdToken }),
    __verifyIdToken: verifyIdToken,
  };
});

jest.mock('../../src/services/adminUserService');

const firebaseAdmin = require('../../src/firebase');
const adminUserService = require('../../src/services/adminUserService');
const { verifyAdminToken } = require('../../src/middleware/adminAuth');

describe('adminAuth middleware', () => {
  afterEach(() => jest.clearAllMocks());

  function makeReq(token) {
    return {
      headers: { authorization: token ? 'Bearer ' + token : undefined },
    };
  }

  function makeRes() {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    return res;
  }

  test('allows valid token with whitelisted email', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user1',
      email: 'jeff@backbonecustomerservice.com',
      email_verified: true,
      name: 'Jeff',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(true);

    const req = makeReq('valid-token');
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminUser.email).toBe('jeff@backbonecustomerservice.com');
  });

  test('rejects missing authorization header', async () => {
    const req = makeReq(null);
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects non-whitelisted email', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user2',
      email: 'stranger@gmail.com',
      email_verified: true,
      name: 'Stranger',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(false);

    const req = makeReq('valid-token');
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid token', async () => {
    firebaseAdmin.__verifyIdToken.mockRejectedValue(
      new Error('auth/invalid-id-token')
    );

    const req = makeReq('bad-token');
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/middleware/adminAuth.test.js --verbose
```
Expected: FAIL — `Cannot find module '../../src/middleware/adminAuth'`

- [ ] **Step 4: Write the implementation**

`backend/src/middleware/adminAuth.js`:
```js
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/middleware/adminAuth.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/middleware/adminAuth.js backend/src/services/adminUserService.js backend/tests/middleware/adminAuth.test.js
git commit -m "feat: add admin auth middleware with Firebase token + email whitelist"
```

---

## Task 3: Admin Auth Verify Route

**Files:**
- Create: `backend/src/routes/admin/auth.js`
- Create: `backend/tests/routes/admin/auth.test.js`

`POST /api/admin/auth/verify` — Called by the React frontend after Google sign-in to confirm the user is authorized.

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/admin/auth.test.js`:
```js
const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn();
  return {
    auth: () => ({ verifyIdToken }),
    __verifyIdToken: verifyIdToken,
  };
});
jest.mock('../../../src/services/adminUserService');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const firebaseAdmin = require('../../../src/firebase');
const adminUserService = require('../../../src/services/adminUserService');
const createApp = require('../../../src/app');

describe('POST /api/admin/auth/verify', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  test('returns user info for authorized user', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user1',
      email: 'jeff@backbonecustomerservice.com',
      email_verified: true,
      name: 'Jeff',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/admin/auth/verify')
      .set('Authorization', 'Bearer valid-firebase-token');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('jeff@backbonecustomerservice.com');
    expect(res.body.name).toBe('Jeff');
  });

  test('returns 403 for unauthorized user', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user2',
      email: 'stranger@gmail.com',
      email_verified: true,
      name: 'Stranger',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/admin/auth/verify')
      .set('Authorization', 'Bearer valid-firebase-token');

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/auth.test.js --verbose
```
Expected: FAIL — route doesn't exist yet

- [ ] **Step 3: Write the route**

`backend/src/routes/admin/auth.js`:
```js
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
```

- [ ] **Step 4: Mount in app.js (temporary — will be finalized in Task 8)**

Add to `backend/src/app.js` at the top with other imports:
```js
const { verifyAdminToken } = require('./middleware/adminAuth');
const adminAuthRouter = require('./routes/admin/auth');
```

Add after the existing API route mounts:
```js
  // Admin routes (authenticated via Firebase token + email whitelist)
  app.use('/api/admin/auth', verifyAdminToken, adminAuthRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/auth.test.js --verbose
```
Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/routes/admin/auth.js backend/tests/routes/admin/auth.test.js backend/src/app.js
git commit -m "feat: add POST /api/admin/auth/verify endpoint"
```

---

## Task 4: Secret Manager Write Operations

**Files:**
- Modify: `backend/src/services/secretManager.js`

Extend the existing Secret Manager service to create and update secrets (needed for store management).

- [ ] **Step 1: Add create and update functions**

Update `backend/src/services/secretManager.js`:
```js
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const config = require('../config');

const client = new SecretManagerServiceClient();

async function getSecret(secretName) {
  const [version] = await client.accessSecretVersion({ name: secretName });
  return version.payload.data.toString('utf8');
}

async function createSecret(secretId, value) {
  const parent = 'projects/' + config.gcpProjectId;

  // Create the secret
  await client.createSecret({
    parent,
    secretId,
    secret: { replication: { automatic: {} } },
  });

  // Add the first version with the actual value
  await client.addSecretVersion({
    parent: parent + '/secrets/' + secretId,
    payload: { data: Buffer.from(value, 'utf8') },
  });

  return parent + '/secrets/' + secretId + '/versions/latest';
}

async function updateSecret(secretId, value) {
  const parent = 'projects/' + config.gcpProjectId + '/secrets/' + secretId;

  await client.addSecretVersion({
    parent,
    payload: { data: Buffer.from(value, 'utf8') },
  });
}

async function deleteSecret(secretId) {
  const name = 'projects/' + config.gcpProjectId + '/secrets/' + secretId;

  try {
    await client.deleteSecret({ name });
  } catch (err) {
    // Ignore NOT_FOUND — secret may have been deleted already
    if (err.code !== 5) throw err;
  }
}

module.exports = { getSecret, createSecret, updateSecret, deleteSecret };
```

- [ ] **Step 2: Run existing tests to verify no regressions**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/services/secretManager.js
git commit -m "feat: add Secret Manager create, update, and delete operations"
```

---

## Task 5: Store Admin Routes

**Files:**
- Create: `backend/src/routes/admin/stores.js`
- Create: `backend/tests/routes/admin/stores.test.js`

CRUD endpoints for store management plus a test-connection endpoint.

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/admin/stores.test.js`:
```js
const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn().mockResolvedValue({
    uid: 'admin1',
    email: 'jeff@backbonecustomerservice.com',
    email_verified: true,
    name: 'Jeff',
  });
  return {
    auth: () => ({ verifyIdToken }),
    __verifyIdToken: verifyIdToken,
  };
});
jest.mock('../../../src/services/adminUserService', () => ({
  isEmailAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/firestore');
jest.mock('../../../src/services/secretManager');
jest.mock('../../../src/services/shopifyClient');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
  gcpProjectId: 'test-project',
  shopifyApiVersion: '2025-01',
}));

const firestore = require('../../../src/firestore');
const secretManager = require('../../../src/services/secretManager');
const shopifyClient = require('../../../src/services/shopifyClient');
const createApp = require('../../../src/app');

describe('Admin Stores API', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /api/admin/stores', () => {
    test('returns all stores', async () => {
      const mockDocs = [
        { id: 'solitsocks', data: () => ({ store_name: 'SolitSocks', shopify_domain: 'solitsocks.myshopify.com', is_active: true }) },
        { id: 'hornbad', data: () => ({ store_name: 'Hornbad', shopify_domain: 'hornbad.myshopify.com', is_active: true }) },
      ];
      firestore.collection = jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: mockDocs }),
        }),
      });

      const res = await request(app)
        .get('/api/admin/stores')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.stores).toHaveLength(2);
      expect(res.body.stores[0].store_name).toBe('SolitSocks');
    });
  });

  describe('POST /api/admin/stores', () => {
    test('creates a new store', async () => {
      const mockSet = jest.fn().mockResolvedValue();
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          set: mockSet,
        }),
      });
      secretManager.createSecret.mockResolvedValue(
        'projects/test-project/secrets/shopify-newstore/versions/latest'
      );

      const res = await request(app)
        .post('/api/admin/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({
          store_name: 'NewStore',
          shopify_domain: 'newstore.myshopify.com',
          api_token: 'shpat_new123',
        });

      expect(res.status).toBe(201);
      expect(secretManager.createSecret).toHaveBeenCalledWith(
        'shopify-newstore',
        'shpat_new123'
      );
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: 'NewStore',
          shopify_domain: 'newstore.myshopify.com',
          is_active: true,
        })
      );
    });

    test('returns 409 if store already exists', async () => {
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: true }),
        }),
      });

      const res = await request(app)
        .post('/api/admin/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({
          store_name: 'ExistingStore',
          shopify_domain: 'existing.myshopify.com',
          api_token: 'shpat_test',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/admin/stores/:id', () => {
    test('deletes store and its secret', async () => {
      const mockDelete = jest.fn().mockResolvedValue();
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ store_name: 'OldStore' }),
          }),
          delete: mockDelete,
        }),
      });
      secretManager.deleteSecret.mockResolvedValue();

      const res = await request(app)
        .delete('/api/admin/stores/oldstore')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockDelete).toHaveBeenCalled();
      expect(secretManager.deleteSecret).toHaveBeenCalledWith('shopify-oldstore');
    });
  });

  describe('PUT /api/admin/stores/:id', () => {
    test('updates store fields', async () => {
      const mockSet = jest.fn().mockResolvedValue();
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              store_name: 'OldName',
              shopify_domain: 'old.myshopify.com',
              secret_name: 'projects/p/secrets/shopify-oldname/versions/latest',
            }),
          }),
          set: mockSet,
        }),
      });
      secretManager.updateSecret = jest.fn().mockResolvedValue();

      const res = await request(app)
        .put('/api/admin/stores/oldname')
        .set('Authorization', 'Bearer valid-token')
        .send({ store_name: 'NewName', shopify_domain: 'new.myshopify.com' });

      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ store_name: 'NewName', shopify_domain: 'new.myshopify.com' }),
        { merge: true }
      );
    });
  });

  describe('POST /api/admin/stores/:id/test', () => {
    test('tests connection to Shopify', async () => {
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              store_name: 'TestStore',
              shopify_domain: 'teststore.myshopify.com',
              secret_name: 'projects/p/secrets/s/versions/latest',
            }),
          }),
        }),
      });
      secretManager.getSecret.mockResolvedValue('shpat_test');
      shopifyClient.getOrdersByEmail.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/admin/stores/teststore/test')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/stores.test.js --verbose
```
Expected: FAIL — route doesn't exist yet

- [ ] **Step 3: Write the implementation**

`backend/src/routes/admin/stores.js`:
```js
const express = require('express');
const firestore = require('../firestore');
const secretManager = require('../services/secretManager');
const shopifyClient = require('../services/shopifyClient');
const config = require('../config');

const router = express.Router();

// GET /api/admin/stores — list all stores
router.get('/', async (req, res) => {
  try {
    const snapshot = await firestore.collection('stores').orderBy('store_name').get();
    const stores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ stores });
  } catch (err) {
    console.error('Failed to list stores:', err.message);
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
    console.error('Failed to create store:', err.message);
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
    console.error('Failed to update store:', err.message);
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
    console.error('Failed to delete store:', err.message);
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
```

- [ ] **Step 4: Mount in app.js**

Add to `backend/src/app.js` imports:
```js
const adminStoresRouter = require('./routes/admin/stores');
```

Add after the auth route mount:
```js
  app.use('/api/admin/stores', verifyAdminToken, adminStoresRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/stores.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/routes/admin/stores.js backend/tests/routes/admin/stores.test.js backend/src/app.js
git commit -m "feat: add admin store management CRUD + test connection endpoints"
```

---

## Task 6: Field Mapping Admin Routes

**Files:**
- Create: `backend/src/routes/admin/fieldMappings.js`
- Create: `backend/tests/routes/admin/fieldMappings.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/admin/fieldMappings.test.js`:
```js
const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn().mockResolvedValue({
    uid: 'admin1', email: 'jeff@backbonecustomerservice.com',
    email_verified: true, name: 'Jeff',
  });
  return { auth: () => ({ verifyIdToken }), __verifyIdToken: verifyIdToken };
});
jest.mock('../../../src/services/adminUserService', () => ({
  isEmailAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/firestore');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const firestore = require('../../../src/firestore');
const createApp = require('../../../src/app');

describe('Admin Field Mappings API', () => {
  let app;

  beforeAll(() => { app = createApp(); });
  afterEach(() => jest.clearAllMocks());

  test('GET /api/admin/field-mappings returns mappings', async () => {
    const mockData = {
      mappings: [
        { shopify_field: 'order_name', zendesk_field_id: '100', label: 'Order ID', enabled: true },
      ],
    };
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => mockData }),
      }),
    });

    const res = await request(app)
      .get('/api/admin/field-mappings')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.mappings).toHaveLength(1);
  });

  test('PUT /api/admin/field-mappings updates mappings', async () => {
    const mockSet = jest.fn().mockResolvedValue();
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({ set: mockSet }),
    });

    const newMappings = {
      mappings: [
        { shopify_field: 'order_name', zendesk_field_id: '100', label: 'Order ID', enabled: true },
        { shopify_field: 'financial_status', zendesk_field_id: '101', label: 'Financial Status', enabled: false },
      ],
    };

    const res = await request(app)
      .put('/api/admin/field-mappings')
      .set('Authorization', 'Bearer valid-token')
      .send(newMappings);

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(newMappings);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/fieldMappings.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/routes/admin/fieldMappings.js`:
```js
const express = require('express');
const firestore = require('../firestore');

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
```

- [ ] **Step 4: Mount in app.js**

Add to `backend/src/app.js` imports:
```js
const adminFieldMappingsRouter = require('./routes/admin/fieldMappings');
```

Add after the stores route mount:
```js
  app.use('/api/admin/field-mappings', verifyAdminToken, adminFieldMappingsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/fieldMappings.test.js --verbose
```
Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/routes/admin/fieldMappings.js backend/tests/routes/admin/fieldMappings.test.js backend/src/app.js
git commit -m "feat: add admin field mapping GET/PUT endpoints"
```

---

## Task 7: Webhook Logs Admin Route

**Files:**
- Create: `backend/src/routes/admin/webhookLogs.js`
- Create: `backend/tests/routes/admin/webhookLogs.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/admin/webhookLogs.test.js`:
```js
const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn().mockResolvedValue({
    uid: 'admin1', email: 'jeff@backbonecustomerservice.com',
    email_verified: true, name: 'Jeff',
  });
  return { auth: () => ({ verifyIdToken }), __verifyIdToken: verifyIdToken };
});
jest.mock('../../../src/services/adminUserService', () => ({
  isEmailAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/firestore');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const firestore = require('../../../src/firestore');
const createApp = require('../../../src/app');

describe('Admin Webhook Logs API', () => {
  let app;

  beforeAll(() => { app = createApp(); });
  afterEach(() => jest.clearAllMocks());

  test('GET /api/admin/webhook-logs returns recent logs', async () => {
    const mockDocs = [
      {
        id: 'log1',
        data: () => ({
          ticket_id: '123', store_name: 'SolitSocks',
          status: 'success', duration_ms: 1200,
          orders_found: 3, error: null,
          timestamp: '2026-03-22T10:30:00Z',
        }),
      },
    ];
    firestore.collection = jest.fn().mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: mockDocs }),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/admin/webhook-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].status).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/webhookLogs.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/routes/admin/webhookLogs.js`:
```js
const express = require('express');
const firestore = require('../firestore');

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
```

- [ ] **Step 4: Mount in app.js**

Add to `backend/src/app.js` imports:
```js
const adminWebhookLogsRouter = require('./routes/admin/webhookLogs');
```

Add after the field mappings route mount:
```js
  app.use('/api/admin/webhook-logs', verifyAdminToken, adminWebhookLogsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/routes/admin/webhookLogs.test.js --verbose
```
Expected: 1 test PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/routes/admin/webhookLogs.js backend/tests/routes/admin/webhookLogs.test.js backend/src/app.js
git commit -m "feat: add admin webhook logs endpoint with summary stats"
```

---

## Task 8: Finalize Admin Route Wiring in app.js

**Files:**
- Modify: `backend/src/app.js`

Ensure all admin routes are properly mounted and the final `app.js` is clean.

- [ ] **Step 1: Write the final app.js**

`backend/src/app.js` (complete version):
```js
const express = require('express');
const { verifyWebhookSignature } = require('./middleware/webhookAuth');
const { verifyZafToken } = require('./middleware/zafAuth');
const { verifyAdminToken } = require('./middleware/adminAuth');
const webhookRouter = require('./routes/webhook');
const ordersRouter = require('./routes/orders');
const lookupRouter = require('./routes/lookup');
const selectOrderRouter = require('./routes/selectOrder');
const adminAuthRouter = require('./routes/admin/auth');
const adminStoresRouter = require('./routes/admin/stores');
const adminFieldMappingsRouter = require('./routes/admin/fieldMappings');
const adminWebhookLogsRouter = require('./routes/admin/webhookLogs');

function createApp() {
  const app = express();

  // Parse JSON with raw body capture for webhook signature verification
  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Webhook routes (authenticated via HMAC signature)
  app.use('/webhook', verifyWebhookSignature, webhookRouter);

  // API routes (authenticated via ZAF JWT)
  app.use('/api/orders', verifyZafToken, ordersRouter);
  app.use('/api/lookup', verifyZafToken, lookupRouter);
  app.use('/api/select-order', verifyZafToken, selectOrderRouter);

  // Admin routes (authenticated via Firebase token + email whitelist)
  app.use('/api/admin/auth', verifyAdminToken, adminAuthRouter);
  app.use('/api/admin/stores', verifyAdminToken, adminStoresRouter);
  app.use('/api/admin/field-mappings', verifyAdminToken, adminFieldMappingsRouter);
  app.use('/api/admin/webhook-logs', verifyAdminToken, adminWebhookLogsRouter);

  return app;
}

module.exports = createApp;
```

- [ ] **Step 2: Run all backend tests**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/app.js
git commit -m "feat: finalize admin route wiring in app.js"
```

---

## Task 9: React App Scaffolding

**Files:**
- Create: `backend/admin/package.json`
- Create: `backend/admin/vite.config.js`
- Create: `backend/admin/index.html`
- Create: `backend/admin/src/main.jsx`
- Create: `backend/admin/src/App.jsx`
- Create: `backend/admin/src/firebase.js`

- [ ] **Step 1: Scaffold the Vite React project**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend
npm create vite@latest admin -- --template react
```

- [ ] **Step 2: Install dependencies**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend/admin
npm install
npm install firebase react-router-dom
```

- [ ] **Step 3: Configure Vite proxy for development**

`backend/admin/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create Firebase client configuration**

`backend/admin/src/firebase.js`:
```js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

Create `backend/admin/.env.example`:
```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

- [ ] **Step 5: Create placeholder App component**

`backend/admin/src/App.jsx`:
```jsx
function App() {
  return (
    <div>
      <h1>Backbone CS — Admin</h1>
      <p>Admin dashboard loading...</p>
    </div>
  );
}

export default App;
```

`backend/admin/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Verify the dev server starts**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend/admin
npm run dev
```
Expected: Vite dev server starts on http://localhost:5173, shows "Backbone CS — Admin"

Kill the dev server after verifying.

- [ ] **Step 7: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/admin/
git commit -m "feat: scaffold React admin UI with Vite and Firebase config"
```

---

## Task 10: Auth Context & Login Page

**Files:**
- Create: `backend/admin/src/contexts/AuthContext.jsx`
- Create: `backend/admin/src/hooks/useAuthFetch.js`
- Create: `backend/admin/src/components/ProtectedRoute.jsx`
- Create: `backend/admin/src/pages/LoginPage.jsx`

- [ ] **Step 1: Create Auth Context**

`backend/admin/src/contexts/AuthContext.jsx`:
```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const response = await fetch('/api/admin/auth/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + idToken,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser({
              uid: firebaseUser.uid,
              email: userData.email,
              name: userData.name,
              photoURL: firebaseUser.photoURL,
              getIdToken: () => firebaseUser.getIdToken(),
            });
            setError(null);
          } else {
            await signOut(auth);
            setUser(null);
            setError('Access denied: your email is not authorized.');
          }
        } catch (err) {
          await signOut(auth);
          setUser(null);
          setError('Authentication failed.');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create authenticated fetch hook**

`backend/admin/src/hooks/useAuthFetch.js`:
```js
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useAuthFetch() {
  const { user, logout } = useAuth();

  return useCallback(async (url, options = {}) => {
    if (!user) throw new Error('Not authenticated');

    const idToken = await user.getIdToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: 'Bearer ' + idToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      await logout();
      throw new Error('Session expired');
    }

    return response;
  }, [user, logout]);
}
```

- [ ] **Step 3: Create ProtectedRoute component**

`backend/admin/src/components/ProtectedRoute.jsx`:
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}
```

- [ ] **Step 4: Create Login page**

`backend/admin/src/pages/LoginPage.jsx`:
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { user, loading, error, loginWithGoogle } = useAuth();

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (user) return <Navigate to="/" replace />;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f9f9' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Backbone CS</h1>
        <p style={{ color: '#68737d', margin: '0 0 24px' }}>Admin Dashboard</p>
        {error && <p style={{ color: '#cc3340', margin: '0 0 16px', fontSize: 14 }}>{error}</p>}
        <button
          onClick={loginWithGoogle}
          style={{
            padding: '10px 24px', fontSize: 14, cursor: 'pointer',
            background: '#1f73b7', color: '#fff', border: 'none',
            borderRadius: 4, fontWeight: 500,
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/admin/src/contexts/ backend/admin/src/hooks/ backend/admin/src/components/ProtectedRoute.jsx backend/admin/src/pages/LoginPage.jsx
git commit -m "feat: add admin auth context, login page, and protected routes"
```

---

## Task 11: Layout & Navigation

**Files:**
- Create: `backend/admin/src/components/Layout.jsx`
- Modify: `backend/admin/src/App.jsx`

- [ ] **Step 1: Create Layout component**

`backend/admin/src/components/Layout.jsx`:
```jsx
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navStyle = {
  width: 200, background: '#03363d', color: '#fff', minHeight: '100vh',
  display: 'flex', flexDirection: 'column', padding: '16px 0',
};

const linkStyle = {
  display: 'block', padding: '10px 20px', color: '#d1e8df',
  textDecoration: 'none', fontSize: 14,
};

const activeLinkStyle = {
  ...linkStyle, background: '#0a4f5c', color: '#fff', fontWeight: 600,
};

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'flex' }}>
      <nav style={navStyle}>
        <div style={{ padding: '0 20px 16px', borderBottom: '1px solid #0a4f5c' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Backbone CS</div>
          <div style={{ fontSize: 12, color: '#aecfc6', marginTop: 4 }}>{user?.email}</div>
        </div>
        <NavLink to="/" end style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Stores
        </NavLink>
        <NavLink to="/field-mappings" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Field Mappings
        </NavLink>
        <NavLink to="/webhook-logs" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Webhook Logs
        </NavLink>
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #0a4f5c' }}>
          <button onClick={logout} style={{
            background: 'none', border: '1px solid #68737d', color: '#d1e8df',
            padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%',
          }}>
            Sign Out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 24, background: '#f8f9f9', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update App.jsx with routing**

`backend/admin/src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { StoresPage } from './pages/StoresPage';
import { FieldMappingsPage } from './pages/FieldMappingsPage';
import { WebhookLogsPage } from './pages/WebhookLogsPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<StoresPage />} />
            <Route path="/field-mappings" element={<FieldMappingsPage />} />
            <Route path="/webhook-logs" element={<WebhookLogsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 3: Create placeholder page components**

`backend/admin/src/pages/StoresPage.jsx`:
```jsx
export function StoresPage() {
  return <h1>Stores</h1>;
}
```

`backend/admin/src/pages/FieldMappingsPage.jsx`:
```jsx
export function FieldMappingsPage() {
  return <h1>Field Mappings</h1>;
}
```

`backend/admin/src/pages/WebhookLogsPage.jsx`:
```jsx
export function WebhookLogsPage() {
  return <h1>Webhook Logs</h1>;
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/admin/src/
git commit -m "feat: add admin layout with sidebar navigation and routing"
```

---

## Task 12: Stores Page

**Files:**
- Modify: `backend/admin/src/pages/StoresPage.jsx`

Full store management UI: list stores with health indicators, add/edit/delete, test connection.

- [ ] **Step 1: Implement the Stores page**

`backend/admin/src/pages/StoresPage.jsx`:
```jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

function healthColor(store) {
  if (store.last_error) return '#cc3340';
  if (!store.last_successful_sync) return '#87929d';
  const hours = (Date.now() - new Date(store.last_successful_sync).getTime()) / 3600000;
  if (hours < 24) return '#038153';
  if (hours < 72) return '#ad5e18';
  return '#cc3340';
}

function StoreForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.store_name || '');
  const [domain, setDomain] = useState(initial?.shopify_domain || '');
  const [token, setToken] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { store_name: name, shopify_domain: domain };
    if (token) data.api_token = token;
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 16, borderRadius: 4, border: '1px solid #d8dcde', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Store Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required disabled={!!initial}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d8dcde', borderRadius: 4, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Shopify Domain</label>
        <input value={domain} onChange={e => setDomain(e.target.value)} required placeholder="store.myshopify.com"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d8dcde', borderRadius: 4, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          API Token {initial && '(leave blank to keep current)'}
        </label>
        <input value={token} onChange={e => setToken(e.target.value)} required={!initial} type="password"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d8dcde', borderRadius: 4, boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ padding: '6px 16px', background: '#1f73b7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {initial ? 'Update' : 'Add Store'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '6px 16px', background: '#fff', border: '1px solid #d8dcde', borderRadius: 4, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function StoresPage() {
  const authFetch = useAuthFetch();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testResult, setTestResult] = useState({});

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/stores');
      const data = await res.json();
      setStores(data.stores || []);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadStores(); }, [loadStores]);

  const handleAdd = async (data) => {
    await authFetch('/api/admin/stores', { method: 'POST', body: JSON.stringify(data) });
    setShowForm(false);
    loadStores();
  };

  const handleEdit = async (data) => {
    await authFetch('/api/admin/stores/' + editing.id, { method: 'PUT', body: JSON.stringify(data) });
    setEditing(null);
    loadStores();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this store? This cannot be undone.')) return;
    await authFetch('/api/admin/stores/' + id, { method: 'DELETE' });
    loadStores();
  };

  const handleTest = async (id) => {
    setTestResult(prev => ({ ...prev, [id]: 'testing...' }));
    try {
      const res = await authFetch('/api/admin/stores/' + id + '/test', { method: 'POST' });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [id]: data.success ? 'Connected' : 'Failed: ' + data.message }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: 'Test failed' }));
    }
  };

  if (loading) return <p>Loading stores...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Stores ({stores.length})</h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          style={{ padding: '6px 16px', background: '#1f73b7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Add Store
        </button>
      </div>

      {showForm && <StoreForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />}
      {editing && <StoreForm initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 4, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f8f9f9', textAlign: 'left', fontSize: 12, color: '#68737d' }}>
            <th style={{ padding: '8px 12px' }}>Health</th>
            <th style={{ padding: '8px 12px' }}>Store Name</th>
            <th style={{ padding: '8px 12px' }}>Domain</th>
            <th style={{ padding: '8px 12px' }}>Last Sync</th>
            <th style={{ padding: '8px 12px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map(store => (
            <tr key={store.id} style={{ borderTop: '1px solid #e9ebed' }}>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: healthColor(store) }} />
              </td>
              <td style={{ padding: '8px 12px', fontWeight: 500 }}>{store.store_name}</td>
              <td style={{ padding: '8px 12px', fontSize: 13, color: '#68737d' }}>{store.shopify_domain}</td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#87929d' }}>
                {store.last_successful_sync ? new Date(store.last_successful_sync).toLocaleString() : 'Never'}
                {store.last_error && <div style={{ color: '#cc3340', fontSize: 11 }}>{store.last_error}</div>}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => handleTest(store.id)} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #d8dcde', borderRadius: 3 }}>Test</button>
                  <button onClick={() => { setEditing(store); setShowForm(false); }} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #d8dcde', borderRadius: 3 }}>Edit</button>
                  <button onClick={() => handleDelete(store.id)} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #cc3340', color: '#cc3340', borderRadius: 3 }}>Delete</button>
                </div>
                {testResult[store.id] && <div style={{ fontSize: 11, marginTop: 4, color: testResult[store.id].startsWith('Connected') ? '#038153' : '#cc3340' }}>{testResult[store.id]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/admin/src/pages/StoresPage.jsx
git commit -m "feat: add admin stores page with CRUD and health indicators"
```

---

## Task 13: Field Mappings Page

**Files:**
- Modify: `backend/admin/src/pages/FieldMappingsPage.jsx`

- [ ] **Step 1: Implement the Field Mappings page**

`backend/admin/src/pages/FieldMappingsPage.jsx`:
```jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

const DEFAULT_FIELDS = [
  { shopify_field: 'order_name', label: 'Order ID / Name' },
  { shopify_field: 'order_status', label: 'Order Status' },
  { shopify_field: 'financial_status', label: 'Financial Status' },
  { shopify_field: 'fulfillment_status', label: 'Fulfillment Status' },
  { shopify_field: 'total_price', label: 'Order Total' },
  { shopify_field: 'order_date', label: 'Order Date' },
  { shopify_field: 'tracking_numbers', label: 'Tracking Number(s)' },
  { shopify_field: 'tracking_urls', label: 'Tracking URL(s)' },
  { shopify_field: 'payment_method', label: 'Payment Method' },
  { shopify_field: 'tags', label: 'Order Tags' },
  { shopify_field: 'shipping_address', label: 'Shipping Address' },
  { shopify_field: 'customer_note', label: 'Customer Note' },
  { shopify_field: 'line_item_1_title', label: 'Product 1 - Title' },
  { shopify_field: 'line_item_1_sku', label: 'Product 1 - SKU' },
  { shopify_field: 'line_item_1_quantity', label: 'Product 1 - Qty' },
  { shopify_field: 'line_item_2_title', label: 'Product 2 - Title' },
  { shopify_field: 'line_item_2_sku', label: 'Product 2 - SKU' },
  { shopify_field: 'line_item_2_quantity', label: 'Product 2 - Qty' },
  { shopify_field: 'line_item_3_title', label: 'Product 3 - Title' },
  { shopify_field: 'line_item_3_sku', label: 'Product 3 - SKU' },
  { shopify_field: 'line_item_3_quantity', label: 'Product 3 - Qty' },
  { shopify_field: 'line_item_4_title', label: 'Product 4 - Title' },
  { shopify_field: 'line_item_4_sku', label: 'Product 4 - SKU' },
  { shopify_field: 'line_item_4_quantity', label: 'Product 4 - Qty' },
  { shopify_field: 'line_item_5_title', label: 'Product 5 - Title' },
  { shopify_field: 'line_item_5_sku', label: 'Product 5 - SKU' },
  { shopify_field: 'line_item_5_quantity', label: 'Product 5 - Qty' },
];

export function FieldMappingsPage() {
  const authFetch = useAuthFetch();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/field-mappings');
      const data = await res.json();

      // Merge saved mappings with defaults
      const savedMap = {};
      (data.mappings || []).forEach(m => { savedMap[m.shopify_field] = m; });

      const merged = DEFAULT_FIELDS.map(field => ({
        shopify_field: field.shopify_field,
        label: field.label,
        zendesk_field_id: savedMap[field.shopify_field]?.zendesk_field_id || '',
        enabled: savedMap[field.shopify_field]?.enabled ?? false,
      }));

      setMappings(merged);
    } catch (err) {
      console.error('Failed to load mappings:', err);
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const handleToggle = (index) => {
    setMappings(prev => prev.map((m, i) =>
      i === index ? { ...m, enabled: !m.enabled } : m
    ));
    setSaved(false);
  };

  const handleFieldIdChange = (index, value) => {
    setMappings(prev => prev.map((m, i) =>
      i === index ? { ...m, zendesk_field_id: value } : m
    ));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await authFetch('/api/admin/field-mappings', {
        method: 'PUT',
        body: JSON.stringify({ mappings }),
      });
      setSaved(true);
    } catch (err) {
      console.error('Failed to save mappings:', err);
    }
    setSaving(false);
  };

  if (loading) return <p>Loading field mappings...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Field Mappings</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ color: '#038153', fontSize: 13 }}>Saved</span>}
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '6px 16px', background: '#1f73b7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#68737d', marginBottom: 16 }}>
        Map Shopify fields to Zendesk custom field IDs. Toggle fields on/off to control which data is written to tickets.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 4 }}>
        <thead>
          <tr style={{ background: '#f8f9f9', textAlign: 'left', fontSize: 12, color: '#68737d' }}>
            <th style={{ padding: '8px 12px', width: 50 }}>On</th>
            <th style={{ padding: '8px 12px' }}>Shopify Field</th>
            <th style={{ padding: '8px 12px' }}>Zendesk Field ID</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => (
            <tr key={m.shopify_field} style={{ borderTop: '1px solid #e9ebed', opacity: m.enabled ? 1 : 0.5 }}>
              <td style={{ padding: '8px 12px' }}>
                <input type="checkbox" checked={m.enabled} onChange={() => handleToggle(i)} />
              </td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{m.label}</td>
              <td style={{ padding: '8px 12px' }}>
                <input value={m.zendesk_field_id} onChange={e => handleFieldIdChange(i, e.target.value)}
                  placeholder="e.g. 12345678" disabled={!m.enabled}
                  style={{ padding: '4px 8px', border: '1px solid #d8dcde', borderRadius: 4, width: 140 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/admin/src/pages/FieldMappingsPage.jsx
git commit -m "feat: add admin field mappings page with toggle and ID configuration"
```

---

## Task 14: Webhook Logs Page

**Files:**
- Modify: `backend/admin/src/pages/WebhookLogsPage.jsx`

- [ ] **Step 1: Implement the Webhook Logs page**

`backend/admin/src/pages/WebhookLogsPage.jsx`:
```jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

const statusColors = {
  success: '#038153',
  warning: '#ad5e18',
  error: '#cc3340',
};

export function WebhookLogsPage() {
  const authFetch = useAuthFetch();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/webhook-logs');
      const data = await res.json();
      setLogs(data.logs || []);
      setSummary(data.summary || {});
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (loading) return <p>Loading webhook logs...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Webhook Logs</h1>
        <button onClick={loadLogs}
          style={{ padding: '6px 16px', background: '#fff', border: '1px solid #d8dcde', borderRadius: 4, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.total || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Total</div>
        </div>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#038153' }}>{summary.success || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Success</div>
        </div>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#cc3340' }}>{summary.error || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Errors</div>
        </div>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#ad5e18' }}>{summary.warning || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Warnings</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 4 }}>
        <thead>
          <tr style={{ background: '#f8f9f9', textAlign: 'left', fontSize: 12, color: '#68737d' }}>
            <th style={{ padding: '8px 12px' }}>Time</th>
            <th style={{ padding: '8px 12px' }}>Status</th>
            <th style={{ padding: '8px 12px' }}>Ticket</th>
            <th style={{ padding: '8px 12px' }}>Store</th>
            <th style={{ padding: '8px 12px' }}>Orders</th>
            <th style={{ padding: '8px 12px' }}>Duration</th>
            <th style={{ padding: '8px 12px' }}>Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} style={{ borderTop: '1px solid #e9ebed' }}>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#87929d' }}>
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                  fontSize: 11, fontWeight: 600, color: '#fff',
                  background: statusColors[log.status] || '#87929d',
                }}>
                  {log.status}
                </span>
              </td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{log.ticket_id}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{log.store_name || '—'}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{log.orders_found}</td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#87929d' }}>{log.duration_ms}ms</td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#cc3340' }}>{log.error || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/admin/src/pages/WebhookLogsPage.jsx
git commit -m "feat: add admin webhook logs page with summary stats and log table"
```

---

## Task 15: Express Static Serving & Dockerfile Update

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/Dockerfile`
- Modify: `backend/.dockerignore`

Serve the built React admin UI from Express and update the Dockerfile for multi-stage builds.

- [ ] **Step 1: Add static file serving to app.js**

Add at the top of `backend/src/app.js`:
```js
const path = require('path');
```

Add at the end of `createApp()`, after all API routes and before `return app`:
```js
  // Serve admin UI static files (production only — dev uses Vite proxy)
  const adminDistPath = path.join(__dirname, '..', 'admin', 'dist');
  app.use('/admin', express.static(adminDistPath));

  // SPA catch-all: serve index.html for any /admin/* route that isn't an API call
  app.get('/admin/*', (_req, res) => {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });

  // Root redirect to admin
  app.get('/', (_req, res) => {
    res.redirect('/admin');
  });
```

Also update `backend/admin/vite.config.js` to set the base path:
```js
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
```

And update `backend/admin/src/App.jsx` to use basename:
```jsx
<BrowserRouter basename="/admin">
```

- [ ] **Step 2: Update Dockerfile for multi-stage build**

`backend/Dockerfile`:
```dockerfile
# Stage 1: Build admin React UI
FROM node:20-slim AS admin-build

WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Copy built admin UI from stage 1
COPY --from=admin-build /app/admin/dist ./admin/dist

EXPOSE 8080

CMD ["node", "src/index.js"]
```

- [ ] **Step 3: Update .dockerignore**

`backend/.dockerignore`:
```
node_modules
admin/node_modules
admin/dist
tests
coverage
.env
.git
*.md
```

- [ ] **Step 4: Build and test locally**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend/admin
npm run build

cd ~/Zendesk\ -\ Shopify\ app/backend
node src/index.js &
curl http://localhost:8080/health
curl -s http://localhost:8080/admin/ | head -5
# Expected: HTML content (the React app's index.html)
kill %1
```

- [ ] **Step 5: Run all backend tests**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/app.js backend/Dockerfile backend/.dockerignore backend/admin/vite.config.js backend/admin/src/App.jsx
git commit -m "feat: serve admin UI from Express + multi-stage Dockerfile"
```

---

## Task 16: Deploy & Test

**Files:** None (deployment commands only)

- [ ] **Step 1: Seed an admin user in Firestore**

Using the Firebase/Firestore console, create a document in the `admin_users` collection:

**Document ID:** `jeff@backbonecustomerservice.com`
```json
{
  "email": "jeff@backbonecustomerservice.com",
  "added_at": "2026-03-23T10:00:00Z"
}
```

Add any other admin emails as separate documents.

- [ ] **Step 2: Set Firebase environment variables (if needed)**

The admin React app needs Firebase config. These are baked into the build. Create `backend/admin/.env`:
```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

Then rebuild:
```bash
cd ~/Zendesk\ -\ Shopify\ app/backend/admin && npm run build
```

- [ ] **Step 3: Deploy to Cloud Run**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend

gcloud run deploy zendesk-shopify-backend \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=$GCP_PROJECT,SHOPIFY_API_VERSION=2025-01,ZENDESK_SUBDOMAIN=your-subdomain,ZENDESK_EMAIL=your-email,ZENDESK_STORE_FIELD_ID=your-field-id" \
  --set-secrets "ZENDESK_API_TOKEN=zendesk-api-token:latest,ZENDESK_WEBHOOK_SECRET=zendesk-webhook-secret:latest,ZAF_SHARED_SECRET=zaf-shared-secret:latest"
```

- [ ] **Step 4: Smoke test the admin UI**

```bash
SERVICE_URL=$(gcloud run services describe zendesk-shopify-backend --region europe-west1 --format 'value(status.url)')
echo "Admin UI: $SERVICE_URL/admin"
```

1. Open `$SERVICE_URL/admin` in a browser
2. Sign in with Google (use a whitelisted email)
3. Verify: Stores page loads, can add/edit/delete stores
4. Verify: Field Mappings page loads, can toggle fields and save
5. Verify: Webhook Logs page loads, shows recent activity

- [ ] **Step 5: Run all tests one final time**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Firebase admin SDK setup | — |
| 2 | Admin auth middleware (Firebase + whitelist) | 4 unit tests |
| 3 | Auth verify endpoint | 2 integration tests |
| 4 | Secret Manager write operations | — (existing tests) |
| 5 | Store admin routes (CRUD + test connection) | 5 integration tests |
| 6 | Field mapping admin routes | 2 integration tests |
| 7 | Webhook logs admin route | 1 integration test |
| 8 | Finalize admin route wiring | All tests pass |
| 9 | React app scaffolding (Vite + Firebase) | Manual dev server |
| 10 | Auth context, login page, protected routes | — (React components) |
| 11 | Layout & navigation | — |
| 12 | Stores page (CRUD + health) | — |
| 13 | Field mappings page | — |
| 14 | Webhook logs page | — |
| 15 | Static serving + Dockerfile update | Manual smoke test |
| 16 | Deploy & test | Manual verification |

**Total: 16 tasks, 14 automated tests + manual testing**
