# Increment 4: Production Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Zendesk-Shopify integration production-ready for 200 stores by adding per-store rate limiting, cache cleanup, structured logging, error handling, config validation, and store health monitoring.

**Architecture:** All changes are in the existing Cloud Run backend. Rate limiting uses an in-memory per-store queue with backoff. Cache cleanup runs as a daily Cloud Run job. Structured logging replaces ad-hoc `console.log` calls with a lightweight logger. Store health updates `last_successful_sync` / `last_error` on store documents after each Shopify API call.

**Tech Stack:** Node.js 20+, Express 4, @google-cloud/firestore, Jest + supertest

**Spec:** `docs/superpowers/specs/2026-03-22-zendesk-shopify-integration-design.md`

---

## Prerequisites

Before starting, ensure:
- **Increments 1–3** are deployed and working
- **Cloud Run** and **Firestore** APIs enabled in GCP project
- `gcloud` CLI installed and authenticated
- Node.js 20+ and npm installed

---

## File Structure

New and modified files (relative to project root):

```
backend/
├── src/
│   ├── config.js                      # Modified: add validation
│   ├── logger.js                      # New: structured logging utility
│   ├── services/
│   │   ├── shopifyClient.js           # Modified: add rate limiter + store health updates
│   │   ├── rateLimiter.js             # New: per-store queue with backoff
│   │   ├── storeHealthService.js      # New: update store health in Firestore
│   │   ├── cacheCleanupService.js     # New: delete old ticket_orders
│   │   └── lookupService.js           # Modified: wrap in error handling + logging
│   ├── routes/
│   │   └── webhook.js                 # Modified: structured logging
│   └── jobs/
│       └── cacheCleanup.js            # New: standalone entry point for Cloud Run job
├── tests/
│   ├── services/
│   │   ├── rateLimiter.test.js        # New
│   │   ├── storeHealthService.test.js # New
│   │   └── cacheCleanupService.test.js # New
│   ├── logger.test.js                 # New
│   └── config.test.js                 # New
└── docs/
    └── deployment-runbook.md          # New: operational guide
```

---

## Task 1: Structured Logger

**Files:**
- Create: `backend/src/logger.js`
- Create: `backend/tests/logger.test.js`

A lightweight structured logger that outputs JSON to stdout (Cloud Run picks this up automatically). Each log entry includes timestamp, level, message, and optional context fields.

- [ ] **Step 1: Write the failing test**

`backend/tests/logger.test.js`:
```js
const { createLogger } = require('../src/logger');

describe('logger', () => {
  let originalWrite;
  let output;

  beforeEach(() => {
    output = [];
    originalWrite = process.stdout.write;
    process.stdout.write = jest.fn((chunk) => {
      output.push(chunk);
      return true;
    });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  test('info outputs JSON with level, message, and timestamp', () => {
    const logger = createLogger();
    logger.info('test message');

    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed.severity).toBe('INFO');
    expect(parsed.message).toBe('test message');
    expect(parsed.timestamp).toBeDefined();
  });

  test('error includes error details', () => {
    const logger = createLogger();
    logger.error('lookup failed', { ticketId: '123', error: 'timeout' });

    const parsed = JSON.parse(output[0]);
    expect(parsed.severity).toBe('ERROR');
    expect(parsed.message).toBe('lookup failed');
    expect(parsed.ticketId).toBe('123');
    expect(parsed.error).toBe('timeout');
  });

  test('warn outputs WARNING severity', () => {
    const logger = createLogger();
    logger.warn('store not found', { storeName: 'TestStore' });

    const parsed = JSON.parse(output[0]);
    expect(parsed.severity).toBe('WARNING');
    expect(parsed.storeName).toBe('TestStore');
  });

  test('child logger includes parent context', () => {
    const logger = createLogger();
    const child = logger.child({ component: 'webhook' });
    child.info('received');

    const parsed = JSON.parse(output[0]);
    expect(parsed.component).toBe('webhook');
    expect(parsed.message).toBe('received');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/logger.test.js --verbose
```
Expected: FAIL — `Cannot find module '../src/logger'`

- [ ] **Step 3: Write the implementation**

`backend/src/logger.js`:
```js
function createLogger(baseContext = {}) {
  function log(severity, message, context = {}) {
    const entry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      ...baseContext,
      ...context,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  return {
    info: (message, context) => log('INFO', message, context),
    warn: (message, context) => log('WARNING', message, context),
    error: (message, context) => log('ERROR', message, context),
    child: (childContext) => createLogger({ ...baseContext, ...childContext }),
  };
}

const logger = createLogger();

module.exports = { createLogger, logger };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/logger.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/logger.js backend/tests/logger.test.js
git commit -m "feat: add structured JSON logger for Cloud Run"
```

---

## Task 2: Config Validation

**Files:**
- Modify: `backend/src/config.js`
- Create: `backend/tests/config.test.js`

Add a `validateConfig()` function that checks all required environment variables are set at startup. Fail fast with a clear error message listing what's missing.

- [ ] **Step 1: Write the failing test**

`backend/tests/config.test.js`:
```js
describe('config validation', () => {
  const REQUIRED_VARS = {
    GCP_PROJECT_ID: 'test-project',
    ZENDESK_SUBDOMAIN: 'test-subdomain',
    ZENDESK_EMAIL: 'test@example.com',
    ZENDESK_API_TOKEN: 'test-token',
    ZENDESK_WEBHOOK_SECRET: 'test-secret',
    ZENDESK_STORE_FIELD_ID: '12345',
    ZAF_SHARED_SECRET: 'test-zaf-secret',
  };

  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Set all required vars
    Object.assign(process.env, REQUIRED_VARS);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('validateConfig passes when all required vars are set', () => {
    const { validateConfig } = require('../src/config');
    expect(() => validateConfig()).not.toThrow();
  });

  test('validateConfig throws when GCP_PROJECT_ID is missing', () => {
    delete process.env.GCP_PROJECT_ID;
    const { validateConfig } = require('../src/config');
    expect(() => validateConfig()).toThrow('GCP_PROJECT_ID');
  });

  test('validateConfig throws listing all missing vars', () => {
    delete process.env.GCP_PROJECT_ID;
    delete process.env.ZENDESK_SUBDOMAIN;
    const { validateConfig } = require('../src/config');
    expect(() => validateConfig()).toThrow('GCP_PROJECT_ID');
    expect(() => validateConfig()).toThrow('ZENDESK_SUBDOMAIN');
  });

  test('SHOPIFY_API_VERSION defaults to 2025-01', () => {
    const cfg = require('../src/config');
    expect(cfg.shopifyApiVersion).toBe('2025-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/config.test.js --verbose
```
Expected: FAIL — `validateConfig is not a function`

- [ ] **Step 3: Update the implementation**

`backend/src/config.js` (complete replacement):
```js
const config = {
  port: process.env.PORT || 8080,
  gcpProjectId: process.env.GCP_PROJECT_ID,
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2025-01',
  zendeskSubdomain: process.env.ZENDESK_SUBDOMAIN,
  zendeskEmail: process.env.ZENDESK_EMAIL,
  zendeskApiToken: process.env.ZENDESK_API_TOKEN,
  zendeskWebhookSecret: process.env.ZENDESK_WEBHOOK_SECRET,
  zendeskStoreFieldId: process.env.ZENDESK_STORE_FIELD_ID,
  zafSharedSecret: process.env.ZAF_SHARED_SECRET,
};

const REQUIRED = [
  'GCP_PROJECT_ID',
  'ZENDESK_SUBDOMAIN',
  'ZENDESK_EMAIL',
  'ZENDESK_API_TOKEN',
  'ZENDESK_WEBHOOK_SECRET',
  'ZENDESK_STORE_FIELD_ID',
  'ZAF_SHARED_SECRET',
];

function validateConfig() {
  const missing = REQUIRED.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

module.exports = config;
module.exports.validateConfig = validateConfig;
```

- [ ] **Step 4: Add validateConfig() call in index.js**

Update `backend/src/index.js` to call `validateConfig()` before starting the server:

```js
const createApp = require('./app');
const config = require('./config');
const { validateConfig } = require('./config');
const { logger } = require('./logger');

validateConfig();

const app = createApp();

app.listen(config.port, () => {
  logger.info('Server started', { port: config.port });
});
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/config.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/config.js backend/src/index.js backend/tests/config.test.js
git commit -m "feat: add config validation with fail-fast on missing env vars"
```

---

## Task 3: Per-Store Rate Limiter

**Files:**
- Create: `backend/src/services/rateLimiter.js`
- Create: `backend/tests/services/rateLimiter.test.js`

Shopify REST API allows ~2 requests/second per store (bucket of 40, refills at 2/sec). This rate limiter queues requests per store and processes them sequentially with a configurable delay. On HTTP 429, it retries with exponential backoff (max 3 retries).

- [ ] **Step 1: Write the failing test**

`backend/tests/services/rateLimiter.test.js`:
```js
const { RateLimiter } = require('../../src/services/rateLimiter');

describe('RateLimiter', () => {
  test('executes a single request immediately', async () => {
    const limiter = new RateLimiter({ delayMs: 0 });
    const fn = jest.fn().mockResolvedValue('result');

    const result = await limiter.schedule('store-a', fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('queues requests for the same store', async () => {
    const callOrder = [];
    const limiter = new RateLimiter({ delayMs: 10 });

    const fn1 = jest.fn().mockImplementation(async () => {
      callOrder.push(1);
      return 'a';
    });
    const fn2 = jest.fn().mockImplementation(async () => {
      callOrder.push(2);
      return 'b';
    });

    const [r1, r2] = await Promise.all([
      limiter.schedule('store-a', fn1),
      limiter.schedule('store-a', fn2),
    ]);

    expect(r1).toBe('a');
    expect(r2).toBe('b');
    expect(callOrder).toEqual([1, 2]);
  });

  test('runs different stores in parallel', async () => {
    const limiter = new RateLimiter({ delayMs: 50 });
    const running = [];

    const makeFn = (store) => jest.fn().mockImplementation(async () => {
      running.push(store);
      await new Promise(r => setTimeout(r, 10));
      return store;
    });

    const [r1, r2] = await Promise.all([
      limiter.schedule('store-a', makeFn('store-a')),
      limiter.schedule('store-b', makeFn('store-b')),
    ]);

    expect(r1).toBe('store-a');
    expect(r2).toBe('store-b');
    // Both should have started (in parallel)
    expect(running).toContain('store-a');
    expect(running).toContain('store-b');
  });

  test('retries on 429 with backoff', async () => {
    const limiter = new RateLimiter({ delayMs: 0, maxRetries: 3, baseBackoffMs: 10 });

    const error429 = new Error('Rate limited');
    error429.response = { status: 429 };

    const fn = jest.fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('success');

    const result = await limiter.schedule('store-a', fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after max retries on 429', async () => {
    const limiter = new RateLimiter({ delayMs: 0, maxRetries: 2, baseBackoffMs: 10 });

    const error429 = new Error('Rate limited');
    error429.response = { status: 429 };

    const fn = jest.fn().mockRejectedValue(error429);

    await expect(limiter.schedule('store-a', fn)).rejects.toThrow('Rate limited');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('does not retry on non-429 errors', async () => {
    const limiter = new RateLimiter({ delayMs: 0, maxRetries: 3, baseBackoffMs: 10 });

    const error500 = new Error('Server error');
    error500.response = { status: 500 };

    const fn = jest.fn().mockRejectedValue(error500);

    await expect(limiter.schedule('store-a', fn)).rejects.toThrow('Server error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/rateLimiter.test.js --verbose
```
Expected: FAIL — `Cannot find module '../../src/services/rateLimiter'`

- [ ] **Step 3: Write the implementation**

`backend/src/services/rateLimiter.js`:
```js
const { logger } = require('../logger');

class RateLimiter {
  constructor({ delayMs = 500, maxRetries = 3, baseBackoffMs = 1000 } = {}) {
    this.delayMs = delayMs;
    this.maxRetries = maxRetries;
    this.baseBackoffMs = baseBackoffMs;
    this.queues = new Map(); // storeId -> Promise chain
  }

  async schedule(storeId, fn) {
    // Chain onto existing queue for this store, or start new
    const previous = this.queues.get(storeId) || Promise.resolve();

    const next = previous
      .catch(() => {}) // Don't let previous failures block the queue
      .then(() => this._delay())
      .then(() => this._executeWithRetry(storeId, fn));

    this.queues.set(storeId, next);

    try {
      return await next;
    } finally {
      // Clean up queue if this was the last item
      if (this.queues.get(storeId) === next) {
        this.queues.delete(storeId);
      }
    }
  }

  async _executeWithRetry(storeId, fn, attempt = 0) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < this.maxRetries) {
        const backoff = this.baseBackoffMs * Math.pow(2, attempt);
        logger.warn('Rate limited by Shopify, retrying', {
          storeId,
          attempt: attempt + 1,
          backoffMs: backoff,
        });
        await new Promise(r => setTimeout(r, backoff));
        return this._executeWithRetry(storeId, fn, attempt + 1);
      }
      throw err;
    }
  }

  _delay() {
    if (this.delayMs <= 0) return Promise.resolve();
    return new Promise(r => setTimeout(r, this.delayMs));
  }
}

// Singleton instance with production defaults
const shopifyRateLimiter = new RateLimiter();

module.exports = { RateLimiter, shopifyRateLimiter };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/rateLimiter.test.js --verbose
```
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/services/rateLimiter.js backend/tests/services/rateLimiter.test.js
git commit -m "feat: add per-store rate limiter with queue and exponential backoff"
```

---

## Task 4: Store Health Service

**Files:**
- Create: `backend/src/services/storeHealthService.js`
- Create: `backend/tests/services/storeHealthService.test.js`

Updates `last_successful_sync` and `last_error` on store documents after each Shopify API call. The admin UI reads these to show health indicators.

- [ ] **Step 1: Write the failing test**

`backend/tests/services/storeHealthService.test.js`:
```js
jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { recordSuccess, recordError } = require('../../src/services/storeHealthService');

describe('storeHealthService', () => {
  afterEach(() => jest.clearAllMocks());

  const mockSet = jest.fn().mockResolvedValue();

  beforeEach(() => {
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        set: mockSet,
      }),
    });
  });

  test('recordSuccess updates last_successful_sync and clears last_error', async () => {
    await recordSuccess('solitsocks');

    expect(firestore.collection).toHaveBeenCalledWith('stores');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        last_successful_sync: expect.any(String),
        last_error: null,
      }),
      { merge: true }
    );
  });

  test('recordError updates last_error with message and timestamp', async () => {
    await recordError('solitsocks', 'API token expired');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error: expect.objectContaining({
          message: 'API token expired',
          timestamp: expect.any(String),
        }),
      }),
      { merge: true }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/storeHealthService.test.js --verbose
```
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Write the implementation**

`backend/src/services/storeHealthService.js`:
```js
const firestore = require('../firestore');
const { logger } = require('../logger');

async function recordSuccess(storeId) {
  try {
    await firestore.collection('stores').doc(storeId).set(
      {
        last_successful_sync: new Date().toISOString(),
        last_error: null,
      },
      { merge: true }
    );
  } catch (err) {
    // Don't let health recording failures break the main flow
    logger.error('Failed to record store health success', {
      storeId,
      error: err.message,
    });
  }
}

async function recordError(storeId, errorMessage) {
  try {
    await firestore.collection('stores').doc(storeId).set(
      {
        last_error: {
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      },
      { merge: true }
    );
  } catch (err) {
    logger.error('Failed to record store health error', {
      storeId,
      error: err.message,
    });
  }
}

module.exports = { recordSuccess, recordError };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/storeHealthService.test.js --verbose
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/services/storeHealthService.js backend/tests/services/storeHealthService.test.js
git commit -m "feat: add store health service for tracking sync status"
```

---

## Task 5: Integrate Rate Limiter + Health into Shopify Client

**Files:**
- Modify: `backend/src/services/shopifyClient.js`
- Modify: `backend/tests/services/shopifyClient.test.js`

Wrap the Shopify API call with the rate limiter and update store health on success/failure.

- [ ] **Step 1: Update the Shopify client implementation**

Modify `backend/src/services/shopifyClient.js` — update the `getOrdersByEmail` function:

```js
const axios = require('axios');
const { shopifyRateLimiter } = require('./rateLimiter');
const { recordSuccess, recordError } = require('./storeHealthService');

// ... keep existing GATEWAY_LABELS, deriveOrderStatus, formatShippingAddress,
//     formatPaymentMethod, normalizeOrder functions unchanged ...

async function getOrdersByEmail({ shopifyDomain, apiToken, apiVersion, email, storeId }) {
  const url = `https://${shopifyDomain}/admin/api/${apiVersion}/orders.json`;

  // Use storeId for rate limiting; fall back to domain if not provided
  const rateLimitKey = storeId || shopifyDomain;

  return shopifyRateLimiter.schedule(rateLimitKey, async () => {
    try {
      const response = await axios.get(url, {
        params: { email, status: 'any', limit: 50 },
        headers: {
          'X-Shopify-Access-Token': apiToken,
          'Content-Type': 'application/json',
        },
      });

      // Record successful API call
      if (storeId) {
        await recordSuccess(storeId);
      }

      return (response.data.orders || []).map(normalizeOrder);
    } catch (err) {
      // Record failed API call
      if (storeId) {
        await recordError(storeId, err.message);
      }
      throw err;
    }
  });
}

module.exports = { getOrdersByEmail, normalizeOrder };
```

- [ ] **Step 2: Update the Shopify client test**

Add to `backend/tests/services/shopifyClient.test.js` — add mocks at the top:

```js
jest.mock('../../src/services/rateLimiter', () => ({
  shopifyRateLimiter: {
    schedule: jest.fn((storeId, fn) => fn()),
  },
}));

jest.mock('../../src/services/storeHealthService', () => ({
  recordSuccess: jest.fn().mockResolvedValue(),
  recordError: jest.fn().mockResolvedValue(),
}));
```

Add new test cases:

```js
const { shopifyRateLimiter } = require('../../src/services/rateLimiter');
const storeHealthService = require('../../src/services/storeHealthService');

// ... existing tests ...

test('records success on store health after successful API call', async () => {
  axios.get.mockResolvedValue({ data: { orders: [] } });

  await getOrdersByEmail({
    shopifyDomain: 'test.myshopify.com',
    apiToken: 'token',
    apiVersion: '2025-01',
    email: 'test@example.com',
    storeId: 'teststore',
  });

  expect(storeHealthService.recordSuccess).toHaveBeenCalledWith('teststore');
});

test('records error on store health after failed API call', async () => {
  axios.get.mockRejectedValue(new Error('Request failed'));

  await expect(
    getOrdersByEmail({
      shopifyDomain: 'test.myshopify.com',
      apiToken: 'token',
      apiVersion: '2025-01',
      email: 'test@example.com',
      storeId: 'teststore',
    })
  ).rejects.toThrow('Request failed');

  expect(storeHealthService.recordError).toHaveBeenCalledWith('teststore', 'Request failed');
});
```

- [ ] **Step 3: Update lookupService to pass storeId**

Modify `backend/src/services/lookupService.js` — update the `shopifyClient.getOrdersByEmail` call to include `storeId`:

Find:
```js
    const orders = await shopifyClient.getOrdersByEmail({
      shopifyDomain: store.shopify_domain,
      apiToken,
      apiVersion: config.shopifyApiVersion,
      email,
    });
```

Replace with:
```js
    const orders = await shopifyClient.getOrdersByEmail({
      shopifyDomain: store.shopify_domain,
      apiToken,
      apiVersion: config.shopifyApiVersion,
      email,
      storeId: store.id,
    });
```

- [ ] **Step 4: Run all Shopify client tests**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/shopifyClient.test.js --verbose
```
Expected: All tests PASS (existing + 2 new)

- [ ] **Step 5: Run lookup service tests to verify no regressions**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/lookupService.test.js --verbose
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/services/shopifyClient.js backend/tests/services/shopifyClient.test.js backend/src/services/lookupService.js
git commit -m "feat: integrate rate limiter and store health into Shopify client"
```

---

## Task 6: Cache Cleanup Service

**Files:**
- Create: `backend/src/services/cacheCleanupService.js`
- Create: `backend/tests/services/cacheCleanupService.test.js`
- Create: `backend/src/jobs/cacheCleanup.js`

Deletes `ticket_orders` documents where `last_synced` is older than 90 days. Runs as a standalone Cloud Run job (daily schedule).

- [ ] **Step 1: Write the failing test**

`backend/tests/services/cacheCleanupService.test.js`:
```js
jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { cleanupOldCache } = require('../../src/services/cacheCleanupService');

describe('cacheCleanupService', () => {
  afterEach(() => jest.clearAllMocks());

  test('deletes documents older than 90 days', async () => {
    const mockDelete = jest.fn().mockResolvedValue();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const mockDocs = [
      {
        id: 'ticket-old-1',
        ref: { delete: mockDelete },
        data: () => ({ last_synced: oldDate.toISOString() }),
      },
      {
        id: 'ticket-old-2',
        ref: { delete: mockDelete },
        data: () => ({ last_synced: oldDate.toISOString() }),
      },
    ];

    firestore.collection = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn()
            .mockResolvedValueOnce({ empty: false, docs: mockDocs })
            .mockResolvedValueOnce({ empty: true, docs: [] }),
        }),
      }),
    });

    const result = await cleanupOldCache();

    expect(result.deleted).toBe(2);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  test('returns 0 when no old documents exist', async () => {
    firestore.collection = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    });

    const result = await cleanupOldCache();

    expect(result.deleted).toBe(0);
  });

  test('uses custom retention days', async () => {
    firestore.collection = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    });

    await cleanupOldCache({ retentionDays: 30 });

    const whereCall = firestore.collection().where;
    expect(whereCall).toHaveBeenCalledWith(
      'last_synced',
      '<',
      expect.any(String)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/cacheCleanupService.test.js --verbose
```
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Write the implementation**

`backend/src/services/cacheCleanupService.js`:
```js
const firestore = require('../firestore');
const { logger } = require('../logger');

const BATCH_SIZE = 100;

async function cleanupOldCache({ retentionDays = 90 } = {}) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoff = cutoffDate.toISOString();

  let totalDeleted = 0;

  logger.info('Starting cache cleanup', { retentionDays, cutoff });

  // Process in batches to avoid memory issues with large result sets
  let hasMore = true;
  while (hasMore) {
    const snapshot = await firestore
      .collection('ticket_orders')
      .where('last_synced', '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    totalDeleted += snapshot.docs.length;

    logger.info('Deleted batch', { batchSize: snapshot.docs.length, totalDeleted });
  }

  logger.info('Cache cleanup complete', { totalDeleted });
  return { deleted: totalDeleted };
}

module.exports = { cleanupOldCache };
```

- [ ] **Step 4: Create the Cloud Run job entry point**

`backend/src/jobs/cacheCleanup.js`:
```js
const { cleanupOldCache } = require('../services/cacheCleanupService');
const { logger } = require('../logger');

async function main() {
  try {
    const result = await cleanupOldCache();
    logger.info('Cache cleanup job finished', result);
    process.exit(0);
  } catch (err) {
    logger.error('Cache cleanup job failed', { error: err.message });
    process.exit(1);
  }
}

main();
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest tests/services/cacheCleanupService.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/services/cacheCleanupService.js backend/tests/services/cacheCleanupService.test.js backend/src/jobs/cacheCleanup.js
git commit -m "feat: add cache cleanup service and Cloud Run job entry point"
```

---

## Task 7: Structured Logging in Webhook & Lookup

**Files:**
- Modify: `backend/src/routes/webhook.js`
- Modify: `backend/src/services/lookupService.js`
- Modify: `backend/src/services/webhookLogService.js`

Replace `console.log`, `console.warn`, and `console.error` calls with the structured logger. Add timing information to webhook processing.

- [ ] **Step 1: Update webhook route with structured logging**

`backend/src/routes/webhook.js` (complete replacement):
```js
const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');
const { logWebhookCall } = require('../services/webhookLogService');
const { logger } = require('../logger');

const webhookLogger = logger.child({ component: 'webhook' });

const router = express.Router();

router.post('/ticket-created', async (req, res) => {
  const ticketId = req.body.ticket_id;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  const startTime = Date.now();
  webhookLogger.info('Webhook received', { ticketId });

  try {
    const result = await lookupOrdersForTicket(String(ticketId));
    const durationMs = Date.now() - startTime;

    if (result.error) {
      webhookLogger.warn('Lookup completed with warning', {
        ticketId,
        error: result.error,
        durationMs,
      });

      await logWebhookCall({
        ticketId: String(ticketId),
        storeName: result.storeName || 'unknown',
        status: 'warning',
        durationMs,
        ordersFound: 0,
        error: result.error,
      });
    } else {
      webhookLogger.info('Lookup completed', {
        ticketId,
        storeName: result.storeName,
        ordersFound: result.ordersFound,
        durationMs,
      });

      await logWebhookCall({
        ticketId: String(ticketId),
        storeName: result.storeName,
        status: 'success',
        durationMs,
        ordersFound: result.ordersFound,
        error: null,
      });
    }

    res.json({ status: 'ok', ...result });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    webhookLogger.error('Lookup failed', {
      ticketId,
      error: err.message,
      durationMs,
    });

    await logWebhookCall({
      ticketId: String(ticketId),
      storeName: 'unknown',
      status: 'error',
      durationMs,
      ordersFound: 0,
      error: err.message,
    }).catch(() => {}); // Don't let log failure crash the webhook

    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Update lookupService with structured logging**

In `backend/src/services/lookupService.js`, replace `console.*` calls with the logger. Add at the top:

```js
const { logger } = require('../logger');
const lookupLogger = logger.child({ component: 'lookup' });
```

Replace any `console.warn` or `console.error` calls in the file with equivalent `lookupLogger.warn` or `lookupLogger.error` calls using the same context object pattern.

- [ ] **Step 3: Replace console calls in store admin routes**

In `backend/src/routes/admin/stores.js`, add at the top:

```js
const { logger } = require('../../logger');
const adminLogger = logger.child({ component: 'admin-stores' });
```

Replace all `console.error('Failed to ...:',  err.message)` calls with:

```js
adminLogger.error('Failed to ...', { error: err.message });
```

- [ ] **Step 4: Run all tests to verify no regressions**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/routes/webhook.js backend/src/services/lookupService.js backend/src/routes/admin/stores.js
git commit -m "feat: replace console logging with structured JSON logger"
```

---

## Task 8: Deployment Runbook

**Files:**
- Create: `backend/docs/deployment-runbook.md`

A comprehensive operational guide for deploying and operating the integration in production.

- [ ] **Step 1: Write the deployment runbook**

`backend/docs/deployment-runbook.md`:
```markdown
# Zendesk-Shopify Integration — Deployment Runbook

## Prerequisites

- Google Cloud project with APIs enabled:
  - Cloud Run
  - Firestore (Native mode)
  - Secret Manager
  - Cloud Scheduler (for cache cleanup job)
- `gcloud` CLI installed and authenticated
- Firebase project (for admin UI auth)
- Zendesk admin access
- At least one Shopify store with a custom app (scopes: `read_orders`, `read_customers`)

## Environment Variables

### Cloud Run Service

| Variable | Description | Example |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | GCP project ID | `backbone-cs-prod` |
| `SHOPIFY_API_VERSION` | Shopify API version | `2025-01` |
| `ZENDESK_SUBDOMAIN` | Zendesk subdomain | `backbonecs` |
| `ZENDESK_EMAIL` | Zendesk API user email | `jeff@backbonecustomerservice.com` |
| `ZENDESK_API_TOKEN` | Zendesk API token (via Secret Manager) | — |
| `ZENDESK_WEBHOOK_SECRET` | Zendesk webhook signing secret (via Secret Manager) | — |
| `ZENDESK_STORE_FIELD_ID` | Zendesk custom field ID for store name | `12345678` |
| `ZAF_SHARED_SECRET` | ZAF shared secret for sidebar auth (via Secret Manager) | — |
| `VITE_FIREBASE_API_KEY` | Firebase client API key (build-time) | — |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (build-time) | `project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID (build-time) | `backbone-cs-prod` |

### Secrets in Secret Manager

```bash
# Create secrets (one-time)
echo -n "YOUR_TOKEN" | gcloud secrets create zendesk-api-token --data-file=-
echo -n "YOUR_SECRET" | gcloud secrets create zendesk-webhook-secret --data-file=-
echo -n "YOUR_SECRET" | gcloud secrets create zaf-shared-secret --data-file=-

# Per-store Shopify tokens
echo -n "shpat_xxx" | gcloud secrets create shopify-storename --data-file=-
```

## Deploy Backend + Admin UI

```bash
cd backend

gcloud run deploy zendesk-shopify-backend \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=$GCP_PROJECT,SHOPIFY_API_VERSION=2025-01,ZENDESK_SUBDOMAIN=your-subdomain,ZENDESK_EMAIL=your-email,ZENDESK_STORE_FIELD_ID=your-field-id" \
  --set-secrets "ZENDESK_API_TOKEN=zendesk-api-token:latest,ZENDESK_WEBHOOK_SECRET=zendesk-webhook-secret:latest,ZAF_SHARED_SECRET=zaf-shared-secret:latest"
```

## Deploy Zendesk Sidebar App

```bash
cd sidebar
zcli apps:package
# Upload the resulting .zip in Zendesk Admin Center → Apps → Upload private app
```

Configure app settings:
- **Backend URL**: Cloud Run service URL (e.g., `https://zendesk-shopify-backend-xxx.europe-west1.run.app`)
- **Shared Secret**: Same value as `ZAF_SHARED_SECRET`

## Set Up Cache Cleanup Job

```bash
# Create a Cloud Run job for cache cleanup
gcloud run jobs create cache-cleanup \
  --source . \
  --region europe-west1 \
  --command "node" \
  --args "src/jobs/cacheCleanup.js" \
  --set-env-vars "GCP_PROJECT_ID=$GCP_PROJECT"

# Schedule it to run daily at 3:00 AM CET
gcloud scheduler jobs create http cache-cleanup-daily \
  --location europe-west1 \
  --schedule "0 3 * * *" \
  --time-zone "Europe/Amsterdam" \
  --uri "https://europe-west1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$GCP_PROJECT/jobs/cache-cleanup:run" \
  --http-method POST \
  --oauth-service-account-email "$GCP_PROJECT@appspot.gserviceaccount.com"
```

## Seed Initial Data

### Admin user (Firestore)

Collection: `admin_users`, Document ID: `jeff@backbonecustomerservice.com`
```json
{
  "email": "jeff@backbonecustomerservice.com",
  "added_at": "2026-03-22T10:00:00Z"
}
```

### Field mappings (Firestore)

Collection: `field_mappings`, Document ID: `global`
```json
{
  "mappings": [
    { "shopify_field": "order_name", "zendesk_field_id": "YOUR_ID", "label": "Order ID", "enabled": true },
    { "shopify_field": "financial_status", "zendesk_field_id": "YOUR_ID", "label": "Financial Status", "enabled": true },
    { "shopify_field": "fulfillment_status", "zendesk_field_id": "YOUR_ID", "label": "Fulfillment Status", "enabled": true }
  ]
}
```

## Zendesk Configuration

### Webhook
1. Go to Admin Center → Apps & Integrations → Webhooks
2. Create webhook:
   - **Endpoint URL**: `https://YOUR_SERVICE_URL/webhook/ticket-created`
   - **Request method**: POST
   - **Request format**: JSON
   - **Authentication**: Signing secret (use same value stored in `zendesk-webhook-secret`)
3. Create a trigger that fires the webhook on ticket creation:
   - **Condition**: Ticket is created
   - **Action**: Notify webhook with JSON body `{"ticket_id": "{{ticket.id}}"}`

### Custom Fields
Create Zendesk custom ticket fields for each Shopify data field you want to display. Note the field IDs and configure them in the admin UI's Field Mappings page.

## Monitoring

### Health Check
```bash
curl $SERVICE_URL/health
# Expected: {"status":"ok"}
```

### Logs
```bash
# View recent logs
gcloud run services logs read zendesk-shopify-backend --region europe-west1 --limit 100

# Filter for errors
gcloud run services logs read zendesk-shopify-backend --region europe-west1 --limit 50 | grep ERROR
```

### Store Health
Check the admin UI → Stores page for health indicators:
- **Green**: Last sync < 24 hours ago
- **Yellow**: Last sync 24–72 hours ago
- **Red**: Last sync > 72 hours ago or last API call errored

### Webhook Logs
Check the admin UI → Webhook Logs page for recent webhook activity, success/failure counts, and error details.

## Updating Shopify API Version

When Shopify deprecates the current API version (~annually):

1. Check the [Shopify API versioning docs](https://shopify.dev/docs/api/usage/versioning)
2. Update the `SHOPIFY_API_VERSION` environment variable:
   ```bash
   gcloud run services update zendesk-shopify-backend \
     --region europe-west1 \
     --update-env-vars "SHOPIFY_API_VERSION=2026-01"
   ```
3. No code changes needed — the version is used dynamically in API URLs

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Sidebar shows "Store not configured" | Store name in Zendesk trigger matches `store_name` in Firestore? | Update store name in admin UI |
| No order data after ticket creation | Webhook firing? Check Zendesk webhook activity log | Re-create webhook or check URL |
| Stale data in sidebar | Click Refresh in sidebar | — |
| Store health indicator red | Admin UI → Stores → check error message | Rotate API token in admin UI |
| Rate limit errors in logs | High ticket volume for one store | Automatically retried; check if persists |
| Cache cleanup not running | Cloud Scheduler job status | Check scheduler logs |

## Adding a New Store

1. Go to admin UI → Stores → Add Store
2. Enter: store name (must match Zendesk trigger value exactly), Shopify domain, API token
3. Click "Test Connection" to verify
4. Set up Zendesk trigger to include store name in tickets
5. Verify by creating a test ticket

## Rotating a Shopify API Token

1. Generate new token in Shopify admin → Custom App → API Credentials
2. Go to admin UI → Stores → Edit → Update API token
3. Click "Test Connection" to verify
```

- [ ] **Step 2: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/docs/deployment-runbook.md
git commit -m "docs: add deployment runbook with operational guide"
```

---

## Task 9: Full Test Suite & Final Verification

**Files:** None (verification only)

Run the complete test suite and verify everything works together.

- [ ] **Step 1: Run the full test suite**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 2: Verify the app starts with config validation**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend
# This should fail with a clear error about missing env vars:
node src/index.js 2>&1 || true
# Expected: Error: Missing required environment variables: GCP_PROJECT_ID, ZENDESK_SUBDOMAIN, ...
```

- [ ] **Step 3: Test Docker build**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend
docker build -t zendesk-shopify-backend .
```
Expected: Build succeeds

- [ ] **Step 4: Commit any final fixes**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add -A
git status
# Only commit if there are changes
git commit -m "chore: final production hardening verification"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Structured JSON logger | 4 unit tests |
| 2 | Config validation (fail-fast) | 4 unit tests |
| 3 | Per-store rate limiter (queue + backoff) | 6 unit tests |
| 4 | Store health service | 2 unit tests |
| 5 | Integrate rate limiter + health into Shopify client | 2 new unit tests |
| 6 | Cache cleanup service + Cloud Run job | 3 unit tests |
| 7 | Structured logging in webhook & lookup | — (replaces console calls) |
| 8 | Deployment runbook | — (documentation) |
| 9 | Full test suite verification | Manual verification |

**Total: 9 tasks, ~21 automated tests**
