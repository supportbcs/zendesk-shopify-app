# Increment 2: Zendesk Sidebar App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a ZAF sidebar app that shows Shopify order data alongside Zendesk tickets, replacing ChannelReply for day-to-day agent use.

**Architecture:** Vanilla JS iframe app using the ZAF SDK. Source files in `src/` are bundled with esbuild into a single `assets/main.js`. Communication with the Cloud Run backend uses ZAF's `client.request()` with JWT authentication (HS256, shared secret). The app runs in Zendesk's ticket sidebar context panel.

**Tech Stack:** ZAF SDK 2.0, esbuild, Zendesk Garden CSS, Jest, ZCLI

**Spec:** `docs/superpowers/specs/2026-03-22-zendesk-shopify-integration-design.md`

---

## Prerequisites

Before starting, ensure:
- **Increment 1 backend** is deployed and working (Cloud Run URL known)
- **ZCLI** installed: `npm install -g @zendesk/zcli`
- **ZCLI authenticated**: `zcli login -i` (use your Zendesk subdomain)
- **ZAF shared secret** generated — a random string (e.g., `openssl rand -hex 32`). This same value must be set as the `ZAF_SHARED_SECRET` environment variable on the Cloud Run backend.
- **Zendesk admin access** for app installation
- Node.js 20+ and npm installed

---

## File Structure

```
sidebar/
├── manifest.json
├── package.json
├── jest.config.js
├── .gitignore
├── src/
│   ├── index.js          # Entry point: ZAF init + orchestration
│   ├── api.js            # Backend API calls via client.request()
│   ├── ui.js             # HTML rendering functions
│   └── poller.js         # Polling/retry logic
├── assets/
│   ├── iframe.html       # ZAF iframe HTML (loads main.js)
│   ├── styles.css        # Zendesk Garden + custom styles
│   └── main.js           # Build output (esbuild bundle)
├── tests/
│   ├── api.test.js
│   ├── ui.test.js
│   └── poller.test.js
└── translations/
    └── en.json
```

---

## Task 1: Backend Patch — Include shopify_domain in Order Cache

**Files:**
- Modify: `backend/src/services/orderCacheService.js`
- Modify: `backend/src/services/lookupService.js`
- Modify: `backend/tests/services/orderCacheService.test.js`
- Modify: `backend/tests/services/lookupService.test.js`

The sidebar needs `shopify_domain` to build "Open in Shopify" links. The Increment 1 backend caches orders but doesn't include the store's Shopify domain. This patch adds it.

- [ ] **Step 1: Update orderCacheService to accept and store shopify_domain**

`backend/src/services/orderCacheService.js` — update the `cacheOrders` function:

```js
async function cacheOrders({ ticketId, storeName, shopifyDomain, customerEmails, orders }) {
  const selectedOrderId = orders.length > 0 ? orders[0].shopify_order_id : null;

  await firestore.collection('ticket_orders').doc(String(ticketId)).set(
    {
      ticket_id: String(ticketId),
      store_name: storeName,
      shopify_domain: shopifyDomain || null,
      customer_emails: customerEmails,
      selected_order_id: selectedOrderId,
      last_synced: new Date().toISOString(),
      orders,
    },
    { merge: true }
  );
}
```

- [ ] **Step 2: Update the orderCacheService test**

In `backend/tests/services/orderCacheService.test.js`, update the `cacheOrders` test:

```js
  test('cacheOrders writes correct document', async () => {
    const orders = [{ shopify_order_id: '123', order_name: '#1' }];

    await cacheOrders({
      ticketId: '98765',
      storeName: 'SolitSocks',
      shopifyDomain: 'solitsocks.myshopify.com',
      customerEmails: ['john@example.com'],
      orders,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '98765',
        store_name: 'SolitSocks',
        shopify_domain: 'solitsocks.myshopify.com',
        customer_emails: ['john@example.com'],
        selected_order_id: '123',
        orders,
      }),
      { merge: true }
    );
  });
```

- [ ] **Step 3: Update lookupService to pass shopifyDomain**

In `backend/src/services/lookupService.js`, update the `cacheOrders` call:

```js
  // 6. Cache in Firestore
  await orderCacheService.cacheOrders({
    ticketId: String(ticketId),
    storeName: store.store_name,
    shopifyDomain: store.shopify_domain,
    customerEmails,
    orders: allOrders,
  });
```

- [ ] **Step 4: Run all backend tests**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/src/services/orderCacheService.js backend/src/services/lookupService.js backend/tests/services/orderCacheService.test.js backend/tests/services/lookupService.test.js
git commit -m "feat: include shopify_domain in order cache for sidebar links"
```

---

## Task 2: ZAF App Scaffolding

**Files:**
- Create: `sidebar/manifest.json`
- Create: `sidebar/package.json`
- Create: `sidebar/jest.config.js`
- Create: `sidebar/.gitignore`
- Create: `sidebar/assets/iframe.html`
- Create: `sidebar/translations/en.json`

- [ ] **Step 1: Create sidebar directory and package.json**

```bash
mkdir -p ~/Zendesk\ -\ Shopify\ app/sidebar
```

`sidebar/package.json`:
```json
{
  "name": "zendesk-shopify-sidebar",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "esbuild src/index.js --bundle --outfile=assets/main.js --format=iife",
    "build:watch": "esbuild src/index.js --bundle --outfile=assets/main.js --format=iife --watch",
    "test": "jest --verbose",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar
npm install -D esbuild jest
```

- [ ] **Step 3: Create config and boilerplate files**

`sidebar/.gitignore`:
```
node_modules/
coverage/
```

`sidebar/jest.config.js`:
```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
};
```

`sidebar/translations/en.json`:
```json
{
  "app": {
    "name": "Shopify Order Data",
    "short_description": "Displays Shopify order data in the ticket sidebar",
    "long_description": "Pulls Shopify order data via the Backbone CS backend and displays it alongside Zendesk tickets. Replaces ChannelReply.",
    "installation_instructions": "Enter the backend API URL (Cloud Run service URL) and the shared secret for JWT authentication."
  }
}
```

- [ ] **Step 4: Create manifest.json**

`sidebar/manifest.json`:
```json
{
  "name": "Shopify Order Data",
  "author": {
    "name": "Backbone Customer Service",
    "email": "info@backbonecustomerservice.com",
    "url": "https://backbonecustomerservice.com"
  },
  "defaultLocale": "en",
  "private": true,
  "version": "1.0",
  "frameworkVersion": "2.0",
  "location": {
    "support": {
      "ticket_sidebar": {
        "url": "assets/iframe.html",
        "flexible": true
      }
    }
  },
  "parameters": [
    {
      "name": "backendUrl",
      "type": "text",
      "required": true
    },
    {
      "name": "shared_secret",
      "type": "text",
      "secure": true,
      "required": true
    }
  ]
}
```

Note: `domainWhitelist` is not needed because requests with `secure: true` are proxied through Zendesk's server.

- [ ] **Step 5: Create iframe.html**

`sidebar/assets/iframe.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/combine/npm/@zendeskgarden/css-bedrock@8,npm/@zendeskgarden/css-buttons@8,npm/@zendeskgarden/css-forms@8,npm/@zendeskgarden/css-utilities@5" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app">Loading...</div>
  <script src="https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create placeholder source files**

```bash
mkdir -p ~/Zendesk\ -\ Shopify\ app/sidebar/src
mkdir -p ~/Zendesk\ -\ Shopify\ app/sidebar/tests
```

`sidebar/src/index.js`:
```js
// Entry point — ZAF init + orchestration
// Will be implemented in Task 9

var client = window.ZAFClient ? ZAFClient.init() : null;
if (client) {
  client.invoke('resize', { width: '100%', height: '80px' });
  document.getElementById('app').textContent = 'Sidebar app loaded.';
}
```

`sidebar/assets/styles.css`:
```css
body {
  margin: 0;
  padding: 8px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #2f3941;
}
```

- [ ] **Step 7: Build and verify**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar
npm run build
# Verify assets/main.js was created
ls -la assets/main.js
```

- [ ] **Step 8: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/
git commit -m "feat: scaffold ZAF sidebar app with manifest and build config"
```

---

## Task 3: API Module

**Files:**
- Create: `sidebar/src/api.js`
- Create: `sidebar/tests/api.test.js`

The API module wraps `client.request()` calls to the backend. All requests use JWT authentication via ZAF's `secure: true` mode — the `{{setting.backendUrl}}` and `{{jwt.token}}` placeholders are replaced server-side by Zendesk, so secrets never reach the browser.

- [ ] **Step 1: Write the failing test**

`sidebar/tests/api.test.js`:
```js
const { buildRequest, getOrders, triggerLookup, selectOrder } = require('../src/api');

describe('api', () => {
  describe('buildRequest', () => {
    test('builds GET request with JWT config', () => {
      const req = buildRequest('/api/orders?ticketId=123');

      expect(req.url).toBe('{{setting.backendUrl}}/api/orders?ticketId=123');
      expect(req.type).toBe('GET');
      expect(req.headers.Authorization).toBe('Bearer {{jwt.token}}');
      expect(req.jwt.algorithm).toBe('HS256');
      expect(req.jwt.secret_key).toBe('{{setting.shared_secret}}');
      expect(req.secure).toBe(true);
    });

    test('builds POST request with body', () => {
      const req = buildRequest('/api/lookup', {
        method: 'POST',
        body: { ticketId: '123' },
      });

      expect(req.type).toBe('POST');
      expect(req.data).toBe('{"ticketId":"123"}');
      expect(req.contentType).toBe('application/json');
    });
  });

  describe('getOrders', () => {
    test('calls client.request with correct path', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({ orders: [] }),
      };

      await getOrders(mockClient, '456');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '{{setting.backendUrl}}/api/orders?ticketId=456',
          type: 'GET',
        })
      );
    });
  });

  describe('triggerLookup', () => {
    test('calls client.request with POST and ticketId', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({ ordersFound: 3 }),
      };

      await triggerLookup(mockClient, '789');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '{{setting.backendUrl}}/api/lookup',
          type: 'POST',
          data: '{"ticketId":"789"}',
        })
      );
    });
  });

  describe('selectOrder', () => {
    test('calls client.request with ticketId and orderId', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({ status: 'ok' }),
      };

      await selectOrder(mockClient, '123', '6001234567890');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '{{setting.backendUrl}}/api/select-order',
          type: 'POST',
          data: '{"ticketId":"123","orderId":"6001234567890"}',
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/api.test.js --verbose
```
Expected: FAIL — `Cannot find module '../src/api'` or functions not defined

- [ ] **Step 3: Write the implementation**

`sidebar/src/api.js`:
```js
function buildRequest(path, options) {
  var opts = options || {};
  var req = {
    url: '{{setting.backendUrl}}' + path,
    type: opts.method || 'GET',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer {{jwt.token}}',
    },
    jwt: {
      algorithm: 'HS256',
      secret_key: '{{setting.shared_secret}}',
      expiry: 3600,
    },
    secure: true,
  };

  if (opts.body) {
    req.data = JSON.stringify(opts.body);
  }

  return req;
}

function getOrders(client, ticketId) {
  return client.request(
    buildRequest('/api/orders?ticketId=' + encodeURIComponent(ticketId))
  );
}

function triggerLookup(client, ticketId) {
  return client.request(
    buildRequest('/api/lookup', {
      method: 'POST',
      body: { ticketId: String(ticketId) },
    })
  );
}

function selectOrder(client, ticketId, orderId) {
  return client.request(
    buildRequest('/api/select-order', {
      method: 'POST',
      body: { ticketId: String(ticketId), orderId: String(orderId) },
    })
  );
}

module.exports = { buildRequest, getOrders, triggerLookup, selectOrder };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/api.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/src/api.js sidebar/tests/api.test.js
git commit -m "feat: add sidebar API module with JWT-authenticated backend calls"
```

---

## Task 4: Poller Module

**Files:**
- Create: `sidebar/src/poller.js`
- Create: `sidebar/tests/poller.test.js`

When the webhook hasn't finished processing yet, the sidebar polls `GET /api/orders` until data appears. The poller retries on 404 (not yet cached), stops on success or real errors, and gives up after max retries.

- [ ] **Step 1: Write the failing test**

`sidebar/tests/poller.test.js`:
```js
const { pollForOrders } = require('../src/poller');

describe('poller', () => {
  test('returns data on first success', async () => {
    var fetchFn = jest.fn().mockResolvedValue({ orders: [{ order_name: '#1' }] });
    var delayFn = jest.fn().mockResolvedValue();

    var result = await pollForOrders(fetchFn, { maxRetries: 5, interval: 2000, delayFn: delayFn });

    expect(result.orders).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
  });

  test('retries on 404 until data arrives', async () => {
    var fetchFn = jest.fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ orders: [{ order_name: '#1' }] });
    var delayFn = jest.fn().mockResolvedValue();

    var result = await pollForOrders(fetchFn, { maxRetries: 5, interval: 2000, delayFn: delayFn });

    expect(result.orders).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
    expect(delayFn).toHaveBeenCalledWith(2000);
  });

  test('throws max_retries after exhausting attempts', async () => {
    var fetchFn = jest.fn().mockRejectedValue({ status: 404 });
    var delayFn = jest.fn().mockResolvedValue();

    await expect(
      pollForOrders(fetchFn, { maxRetries: 3, interval: 1000, delayFn: delayFn })
    ).rejects.toThrow('max_retries');

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
  });

  test('throws immediately on non-404 errors', async () => {
    var fetchFn = jest.fn().mockRejectedValue({ status: 500, responseText: 'Server error' });
    var delayFn = jest.fn().mockResolvedValue();

    await expect(
      pollForOrders(fetchFn, { maxRetries: 5, interval: 2000, delayFn: delayFn })
    ).rejects.toEqual({ status: 500, responseText: 'Server error' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/poller.test.js --verbose
```
Expected: FAIL — `Cannot find module '../src/poller'`

- [ ] **Step 3: Write the implementation**

`sidebar/src/poller.js`:
```js
function defaultDelay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function pollForOrders(fetchFn, options) {
  var opts = options || {};
  var interval = opts.interval || 2000;
  var maxRetries = opts.maxRetries || 5;
  var delay = opts.delayFn || defaultDelay;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (err) {
      // If it's a real error (not 404), throw immediately
      if (err && err.status && err.status !== 404) {
        throw err;
      }
      // If we have retries left, wait and try again
      if (attempt < maxRetries - 1) {
        await delay(interval);
      }
    }
  }

  throw new Error('max_retries');
}

module.exports = { pollForOrders };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/poller.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/src/poller.js sidebar/tests/poller.test.js
git commit -m "feat: add sidebar poller with retry logic for loading state"
```

---

## Task 5: UI Module — Utilities

**Files:**
- Create: `sidebar/src/ui.js`
- Create: `sidebar/tests/ui.test.js`

Pure functions for HTML escaping, date formatting, and time-ago display. These are used by the rendering functions in Tasks 6-8.

- [ ] **Step 1: Write the failing test**

`sidebar/tests/ui.test.js`:
```js
const {
  escapeHtml,
  formatDate,
  formatTimeAgo,
} = require('../src/ui');

describe('ui utilities', () => {
  describe('escapeHtml', () => {
    test('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    test('returns empty string for null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
      expect(escapeHtml(42)).toBe('42');
    });
  });

  describe('formatDate', () => {
    test('formats ISO date string', () => {
      var result = formatDate('2026-03-18T14:22:00+01:00');
      // The exact format depends on locale, but should contain key parts
      expect(result).toContain('2026');
      expect(result).toContain('18');
    });

    test('returns empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });
  });

  describe('formatTimeAgo', () => {
    test('shows "just now" for recent timestamps', () => {
      var now = new Date().toISOString();
      expect(formatTimeAgo(now)).toBe('just now');
    });

    test('shows minutes ago', () => {
      var fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatTimeAgo(fiveMinAgo)).toBe('5 min ago');
    });

    test('shows hours ago', () => {
      var twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(twoHoursAgo)).toBe('2 hours ago');
    });

    test('shows days ago', () => {
      var threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(threeDaysAgo)).toBe('3 days ago');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/ui.test.js --verbose
```
Expected: FAIL — functions not defined

- [ ] **Step 3: Write the implementation**

`sidebar/src/ui.js`:
```js
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  var now = Date.now();
  var then = new Date(isoString).getTime();
  var diffMs = now - then;
  var diffMin = Math.floor(diffMs / 60000);
  var diffHrs = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return diffMin + ' min ago';
  if (diffHrs < 24) return diffHrs + ' hours ago';
  return diffDays + ' days ago';
}

module.exports = {
  escapeHtml: escapeHtml,
  formatDate: formatDate,
  formatTimeAgo: formatTimeAgo,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/ui.test.js --verbose
```
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/src/ui.js sidebar/tests/ui.test.js
git commit -m "feat: add sidebar UI utility functions (escapeHtml, formatDate, formatTimeAgo)"
```

---

## Task 6: UI Module — State Rendering

**Files:**
- Modify: `sidebar/src/ui.js`
- Modify: `sidebar/tests/ui.test.js`

Functions that return HTML strings for loading, error, empty, and unconfigured states.

- [ ] **Step 1: Add failing tests**

Append to `sidebar/tests/ui.test.js`:
```js
const {
  renderLoading,
  renderError,
  renderNoOrders,
  renderStoreNotConfigured,
} = require('../src/ui');

describe('ui state rendering', () => {
  test('renderLoading shows spinner message', () => {
    var html = renderLoading();
    expect(html).toContain('loading');
    expect(html).toContain('Loading order data');
  });

  test('renderError shows error message and retry button', () => {
    var html = renderError('Something went wrong');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('id="refresh-btn"');
  });

  test('renderError escapes HTML in message', () => {
    var html = renderError('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renderNoOrders shows empty state with refresh button', () => {
    var html = renderNoOrders();
    expect(html).toContain('No Shopify orders found');
    expect(html).toContain('id="refresh-btn"');
  });

  test('renderStoreNotConfigured shows admin message', () => {
    var html = renderStoreNotConfigured();
    expect(html).toContain('Store not configured');
    expect(html).toContain('contact admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/ui.test.js --verbose
```
Expected: FAIL — new functions not defined

- [ ] **Step 3: Add the implementations to ui.js**

Append to `sidebar/src/ui.js`:
```js
function renderLoading() {
  return '<div class="state-message loading">' +
    '<div class="spinner"></div>' +
    '<p>Loading order data...</p>' +
    '</div>';
}

function renderError(message) {
  return '<div class="state-message error">' +
    '<p>' + escapeHtml(message) + '</p>' +
    '<button id="refresh-btn" class="c-btn c-btn--primary">Retry</button>' +
    '</div>';
}

function renderNoOrders() {
  return '<div class="state-message empty">' +
    '<p>No Shopify orders found for this customer.</p>' +
    '<button id="refresh-btn" class="c-btn c-btn--primary">Refresh</button>' +
    '</div>';
}

function renderStoreNotConfigured() {
  return '<div class="state-message error">' +
    '<p>Store not configured — contact admin.</p>' +
    '</div>';
}
```

Update the `module.exports` at the bottom of `ui.js` to include the new functions:
```js
module.exports = {
  escapeHtml: escapeHtml,
  formatDate: formatDate,
  formatTimeAgo: formatTimeAgo,
  renderLoading: renderLoading,
  renderError: renderError,
  renderNoOrders: renderNoOrders,
  renderStoreNotConfigured: renderStoreNotConfigured,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/ui.test.js --verbose
```
Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/src/ui.js sidebar/tests/ui.test.js
git commit -m "feat: add sidebar UI state rendering (loading, error, empty, unconfigured)"
```

---

## Task 7: UI Module — Order Display

**Files:**
- Modify: `sidebar/src/ui.js`
- Modify: `sidebar/tests/ui.test.js`

The main rendering function that displays a selected order's full data, plus the order selector dropdown.

- [ ] **Step 1: Add failing tests**

Append to `sidebar/tests/ui.test.js`:
```js
const {
  renderOrderSelector,
  renderOrderData,
} = require('../src/ui');

var MOCK_DATA = {
  store_name: 'SolitSocks',
  shopify_domain: 'solitsocks.myshopify.com',
  customer_emails: ['john@example.com'],
  selected_order_id: '6001234567890',
  last_synced: new Date().toISOString(),
  orders: [
    {
      shopify_order_id: '6001234567890',
      order_name: '#1052',
      order_status: 'open',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '49.95',
      currency: 'EUR',
      created_at: '2026-03-18T14:22:00+01:00',
      tracking_numbers: ['3SXYZ123456'],
      tracking_urls: ['https://tracking.example.com/3SXYZ123456'],
      payment_method: 'Credit Card',
      tags: 'vip, repeat-customer',
      customer_note: 'Please gift wrap',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      line_items: [
        { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1 },
        { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2 },
      ],
    },
    {
      shopify_order_id: '6001234567891',
      order_name: '#1031',
      order_status: 'closed',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '29.95',
      currency: 'EUR',
      created_at: '2026-02-02T10:00:00+01:00',
      tracking_numbers: [],
      tracking_urls: [],
      payment_method: 'PayPal',
      tags: '',
      customer_note: '',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      line_items: [
        { title: 'Red Crew Socks (S)', sku: 'RCS-S-003', quantity: 3 },
      ],
    },
  ],
};

describe('ui order rendering', () => {
  describe('renderOrderSelector', () => {
    test('renders dropdown with multiple orders', () => {
      var html = renderOrderSelector(MOCK_DATA.orders, '6001234567890');
      expect(html).toContain('<select');
      expect(html).toContain('id="order-select"');
      expect(html).toContain('#1052');
      expect(html).toContain('#1031');
      expect(html).toContain('selected');
    });

    test('returns empty string for single order', () => {
      var html = renderOrderSelector([MOCK_DATA.orders[0]], '6001234567890');
      expect(html).toBe('');
    });
  });

  describe('renderOrderData', () => {
    test('renders full order display', () => {
      var html = renderOrderData(MOCK_DATA);
      expect(html).toContain('SolitSocks');
      expect(html).toContain('john@example.com');
      expect(html).toContain('#1052');
      expect(html).toContain('open');
      expect(html).toContain('paid');
      expect(html).toContain('fulfilled');
      expect(html).toContain('49.95');
      expect(html).toContain('EUR');
      expect(html).toContain('Credit Card');
      expect(html).toContain('3SXYZ123456');
      expect(html).toContain('tracking.example.com');
      expect(html).toContain('Black Crew Socks (M)');
      expect(html).toContain('White Ankle Socks (L)');
      expect(html).toContain('Kerkstraat 12');
      expect(html).toContain('vip, repeat-customer');
      expect(html).toContain('Please gift wrap');
      expect(html).toContain('id="refresh-btn"');
      expect(html).toContain('id="open-shopify"');
      expect(html).toContain('solitsocks.myshopify.com/admin/orders/6001234567890');
      expect(html).toContain('Last synced');
    });

    test('renders no-orders state when orders array is empty', () => {
      var emptyData = Object.assign({}, MOCK_DATA, { orders: [] });
      var html = renderOrderData(emptyData);
      expect(html).toContain('No Shopify orders found');
    });

    test('hides tracking section when no tracking numbers', () => {
      var data = Object.assign({}, MOCK_DATA, {
        selected_order_id: '6001234567891',
      });
      var html = renderOrderData(data);
      expect(html).not.toContain('tracking.example.com');
    });

    test('hides customer note when empty', () => {
      var data = Object.assign({}, MOCK_DATA, {
        selected_order_id: '6001234567891',
      });
      var html = renderOrderData(data);
      expect(html).not.toContain('Note');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/ui.test.js --verbose
```
Expected: FAIL — `renderOrderSelector` and `renderOrderData` not defined

- [ ] **Step 3: Add the implementations to ui.js**

Append to `sidebar/src/ui.js`:
```js
function renderOrderSelector(orders, selectedOrderId) {
  if (!orders || orders.length <= 1) return '';

  var options = orders.map(function (order) {
    var date = formatDate(order.created_at);
    var selected = order.shopify_order_id === selectedOrderId ? ' selected' : '';
    return '<option value="' + escapeHtml(order.shopify_order_id) + '"' + selected + '>' +
      escapeHtml(order.order_name) + ' (' + escapeHtml(date) + ')' +
      '</option>';
  }).join('');

  return '<div class="order-selector">' +
    '<select id="order-select" class="c-txt__input">' + options + '</select>' +
    '</div>';
}

function renderTrackingSection(order) {
  if (!order.tracking_numbers || order.tracking_numbers.length === 0) return '';

  var links = order.tracking_numbers.map(function (num, i) {
    var url = order.tracking_urls && order.tracking_urls[i];
    if (url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
        escapeHtml(num) + '</a>';
    }
    return '<span>' + escapeHtml(num) + '</span>';
  }).join(', ');

  return '<div class="field">' +
    '<span class="label">Tracking</span>' +
    '<span class="value">' + links + '</span>' +
    '</div>';
}

function renderLineItems(items) {
  if (!items || items.length === 0) return '';

  var listItems = items.map(function (item) {
    return '<li>' + escapeHtml(item.quantity) + 'x ' + escapeHtml(item.title) + '</li>';
  }).join('');

  return '<div class="field">' +
    '<span class="label">Products</span>' +
    '<ul class="product-list">' + listItems + '</ul>' +
    '</div>';
}

function renderOrderData(data) {
  if (!data.orders || data.orders.length === 0) {
    return renderNoOrders();
  }

  var selectedId = data.selected_order_id;
  var order = data.orders.find(function (o) { return o.shopify_order_id === selectedId; });
  if (!order) order = data.orders[0];

  var shopifyUrl = 'https://' + escapeHtml(data.shopify_domain) +
    '/admin/orders/' + escapeHtml(order.shopify_order_id);

  var shippingHtml = '';
  if (order.shipping_address) {
    shippingHtml = '<div class="field">' +
      '<span class="label">Shipping</span>' +
      '<span class="value address">' + escapeHtml(order.shipping_address).replace(/\n/g, '<br>') + '</span>' +
      '</div>';
  }

  var tagsHtml = '';
  if (order.tags) {
    tagsHtml = '<div class="field">' +
      '<span class="label">Tags</span>' +
      '<span class="value">' + escapeHtml(order.tags) + '</span>' +
      '</div>';
  }

  var noteHtml = '';
  if (order.customer_note) {
    noteHtml = '<div class="field">' +
      '<span class="label">Note</span>' +
      '<span class="value">&ldquo;' + escapeHtml(order.customer_note) + '&rdquo;</span>' +
      '</div>';
  }

  return '<div class="sidebar-content">' +
    '<div class="header">' +
      '<h2>Shopify Order Data</h2>' +
      '<div class="field"><span class="label">Store</span><span class="value">' + escapeHtml(data.store_name) + '</span></div>' +
      '<div class="field"><span class="label">Customer</span><span class="value">' + escapeHtml((data.customer_emails || [])[0] || '') + '</span></div>' +
    '</div>' +
    renderOrderSelector(data.orders, order.shopify_order_id) +
    '<div class="order-details">' +
      '<div class="field"><span class="label">Status</span><span class="value badge badge-' + escapeHtml(order.order_status) + '">' + escapeHtml(order.order_status) + '</span></div>' +
      '<div class="field"><span class="label">Payment</span><span class="value">' + escapeHtml(order.financial_status) + '</span></div>' +
      '<div class="field"><span class="label">Fulfillment</span><span class="value">' + escapeHtml(order.fulfillment_status) + '</span></div>' +
      '<div class="field"><span class="label">Total</span><span class="value">' + escapeHtml(order.total_price) + ' ' + escapeHtml(order.currency) + '</span></div>' +
      '<div class="field"><span class="label">Payment Method</span><span class="value">' + escapeHtml(order.payment_method) + '</span></div>' +
      '<div class="field"><span class="label">Date</span><span class="value">' + formatDate(order.created_at) + '</span></div>' +
      renderTrackingSection(order) +
      renderLineItems(order.line_items) +
      shippingHtml +
      tagsHtml +
      noteHtml +
    '</div>' +
    '<div class="actions">' +
      '<button id="refresh-btn" class="c-btn">Refresh</button>' +
      '<a id="open-shopify" href="' + shopifyUrl + '" target="_blank" rel="noopener" class="c-btn c-btn--primary">Open in Shopify ↗</a>' +
    '</div>' +
    '<div class="last-synced">Last synced: ' + formatTimeAgo(data.last_synced) + '</div>' +
    '</div>';
}
```

Update the `module.exports` at the bottom of `ui.js` to include the new functions:
```js
module.exports = {
  escapeHtml: escapeHtml,
  formatDate: formatDate,
  formatTimeAgo: formatTimeAgo,
  renderLoading: renderLoading,
  renderError: renderError,
  renderNoOrders: renderNoOrders,
  renderStoreNotConfigured: renderStoreNotConfigured,
  renderOrderSelector: renderOrderSelector,
  renderOrderData: renderOrderData,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest tests/ui.test.js --verbose
```
Expected: 18 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/src/ui.js sidebar/tests/ui.test.js
git commit -m "feat: add sidebar order display and selector rendering"
```

---

## Task 8: Styles

**Files:**
- Modify: `sidebar/assets/styles.css`

Zendesk Garden CSS handles base styling. This adds sidebar-specific layout, field styling, loading spinner, and status badges.

- [ ] **Step 1: Write the stylesheet**

`sidebar/assets/styles.css`:
```css
/* Base */
body {
  margin: 0;
  padding: 8px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #2f3941;
  line-height: 1.4;
}

/* Header */
.header h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #03363d;
}

/* Fields (label + value pairs) */
.field {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 4px 0;
  border-bottom: 1px solid #f3f3f3;
}

.field:last-child {
  border-bottom: none;
}

.label {
  font-weight: 600;
  color: #68737d;
  font-size: 12px;
  min-width: 90px;
  flex-shrink: 0;
}

.value {
  text-align: right;
  word-break: break-word;
}

.value.address {
  text-align: right;
  font-size: 12px;
}

/* Status badges */
.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
}

.badge-open { background: #edf7ff; color: #1f73b7; }
.badge-closed { background: #f8f9f9; color: #68737d; }
.badge-cancelled { background: #fff0f1; color: #cc3340; }

/* Order selector */
.order-selector {
  margin: 8px 0;
}

.order-selector select {
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid #d8dcde;
  border-radius: 4px;
  background: #fff;
}

/* Order details section */
.order-details {
  margin: 8px 0;
}

/* Product list */
.product-list {
  list-style: none;
  margin: 4px 0 0 0;
  padding: 0;
  text-align: right;
}

.product-list li {
  font-size: 12px;
  padding: 2px 0;
}

/* Tracking links */
.field a {
  color: #1f73b7;
  text-decoration: none;
}

.field a:hover {
  text-decoration: underline;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  margin: 12px 0 4px 0;
}

.actions .c-btn {
  flex: 1;
  text-align: center;
  font-size: 12px;
  padding: 6px 12px;
  text-decoration: none;
}

/* Last synced */
.last-synced {
  text-align: center;
  font-size: 11px;
  color: #87929d;
  margin-top: 4px;
}

/* State messages */
.state-message {
  text-align: center;
  padding: 20px 8px;
}

.state-message p {
  margin: 0 0 12px 0;
  color: #68737d;
}

/* Loading spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #d8dcde;
  border-top-color: #1f73b7;
  border-radius: 50%;
  margin: 0 auto 12px auto;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 2: Build to verify CSS is loaded by iframe.html**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/assets/styles.css
git commit -m "feat: add sidebar styles with Zendesk Garden integration"
```

---

## Task 9: Main Module — Full Orchestration

**Files:**
- Modify: `sidebar/src/index.js`

This is the entry point that ties everything together: initializes ZAF, loads order data, handles polling/fallback, and attaches event handlers. Not unit tested — tested manually via ZCLI (Task 10).

- [ ] **Step 1: Write the full implementation**

`sidebar/src/index.js`:
```js
var api = require('./api');
var poller = require('./poller');
var ui = require('./ui');

(function main() {
  // ZAFClient is provided by the ZAF SDK script loaded before this bundle
  if (typeof ZAFClient === 'undefined') {
    console.error('ZAFClient not available');
    return;
  }

  var client = ZAFClient.init();
  var container = document.getElementById('app');
  var currentData = null;

  // Resize app to fit content dynamically
  function resizeApp() {
    var height = Math.max(document.body.scrollHeight, 80);
    client.invoke('resize', { width: '100%', height: height + 'px' });
  }

  // Observe DOM changes to auto-resize
  var observer = new MutationObserver(resizeApp);
  observer.observe(container, { childList: true, subtree: true });

  // -- Rendering helpers --

  function render(html) {
    container.innerHTML = html;
    resizeApp();
  }

  function renderApp(data) {
    currentData = data;

    if (data.error === 'store_not_found' || data.error === 'no_store_name') {
      render(ui.renderStoreNotConfigured());
      return;
    }

    if (!data.orders || data.orders.length === 0) {
      render(ui.renderNoOrders());
      attachRefreshHandler();
      return;
    }

    render(ui.renderOrderData(data));
    attachEventHandlers(data);
  }

  // -- Event handlers --

  function attachEventHandlers(data) {
    attachOrderSelectorHandler(data);
    attachRefreshHandler();
  }

  function attachOrderSelectorHandler(data) {
    var select = document.getElementById('order-select');
    if (!select) return;

    select.addEventListener('change', function (e) {
      var orderId = e.target.value;
      render(ui.renderLoading());

      api.selectOrder(client, data.ticket_id, orderId)
        .then(function () {
          data.selected_order_id = orderId;
          renderApp(data);
        })
        .catch(function () {
          client.invoke('notify', 'Failed to switch order', 'error');
          renderApp(data);
        });
    });
  }

  function attachRefreshHandler() {
    var refreshBtn = document.getElementById('refresh-btn');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', function () {
      loadOrderData(true);
    });
  }

  // -- Data loading --

  function loadOrderData(forceRefresh) {
    render(ui.renderLoading());

    client.get('ticket.id').then(function (ticketData) {
      var ticketId = String(ticketData['ticket.id']);

      if (forceRefresh) {
        // Manual refresh: trigger backend lookup, then fetch cached data
        api.triggerLookup(client, ticketId)
          .then(function (result) {
            if (result.error) {
              render(ui.renderError('Lookup failed: ' + result.error));
              attachRefreshHandler();
              return;
            }
            return api.getOrders(client, ticketId);
          })
          .then(function (data) {
            if (data) renderApp(data);
          })
          .catch(function () {
            render(ui.renderError('Refresh failed — try again'));
            attachRefreshHandler();
          });
        return;
      }

      // Normal load: try cached data, poll if not ready, fallback to live lookup
      api.getOrders(client, ticketId)
        .then(function (data) {
          renderApp(data);
        })
        .catch(function (err) {
          if (err && err.status === 404) {
            // No cached data yet — poll (webhook may still be processing)
            poller.pollForOrders(
              function () { return api.getOrders(client, ticketId); },
              { interval: 2000, maxRetries: 5 }
            )
              .then(function (data) {
                renderApp(data);
              })
              .catch(function (pollErr) {
                if (pollErr.message === 'max_retries') {
                  // Last resort: trigger a live lookup
                  api.triggerLookup(client, ticketId)
                    .then(function () {
                      return api.getOrders(client, ticketId);
                    })
                    .then(function (data) {
                      renderApp(data);
                    })
                    .catch(function () {
                      render(ui.renderError('Could not fetch order data — click Refresh'));
                      attachRefreshHandler();
                    });
                } else {
                  render(ui.renderError('Could not fetch order data — click Refresh'));
                  attachRefreshHandler();
                }
              });
          } else {
            render(ui.renderError('Could not fetch order data — click Refresh'));
            attachRefreshHandler();
          }
        });
    });
  }

  // -- Start --
  loadOrderData(false);
})();
```

- [ ] **Step 2: Build the bundle**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npm run build
```
Expected: `assets/main.js` created without errors

- [ ] **Step 3: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/src/index.js sidebar/assets/main.js
git commit -m "feat: add sidebar main module with full data loading orchestration"
```

---

## Task 10: Local Development Testing

**Files:** None (testing procedure only)

Test the sidebar app locally using ZCLI against a real Zendesk instance. This validates the full flow: ZAF init → API calls → rendering.

- [ ] **Step 1: Start the local app server**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar
npm run build
zcli apps:server .
```

The server starts on `http://localhost:4567` by default.

- [ ] **Step 2: Load the app in Zendesk**

Open any ticket in your Zendesk instance with `?zcli_apps=true` appended to the URL:
```
https://YOUR-SUBDOMAIN.zendesk.com/agent/tickets/123?zcli_apps=true
```

When prompted, configure the app parameters:
- **backendUrl**: Your Cloud Run service URL (e.g., `https://zendesk-shopify-backend-xxxxx-ew.a.run.app`)
- **shared_secret**: The same secret set as `ZAF_SHARED_SECRET` on the backend

- [ ] **Step 3: Verify the sidebar app**

Manual testing checklist:

| Test | Expected Result |
|------|----------------|
| Open ticket with a configured store | Order data displays in sidebar |
| Open ticket with no orders | "No Shopify orders found" message with Refresh button |
| Open ticket with unconfigured store | "Store not configured — contact admin" message |
| Click "Refresh" | Data reloads from Shopify, sidebar updates |
| Select different order from dropdown | Sidebar updates with new order details, ticket fields update |
| Click "Open in Shopify" | New tab opens with correct Shopify admin order URL |
| Open ticket before webhook completes | Loading spinner → data appears after polling |
| Backend is down | Error message with Retry button |

- [ ] **Step 4: Run the automated test suite**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar && npx jest --verbose
```
Expected: All tests PASS (api: 4, poller: 4, ui: 18 = 26 total)

---

## Task 11: Package & Deploy

**Files:**
- Modify: `sidebar/assets/main.js` (rebuild)

- [ ] **Step 1: Build the production bundle**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar
npm run build
```

- [ ] **Step 2: Validate and package the app**

```bash
cd ~/Zendesk\ -\ Shopify\ app/sidebar
zcli apps:validate .
zcli apps:package .
```
Expected: Creates a `.zip` file (e.g., `tmp/app-YYYYMMDDHHMMSS.zip`)

- [ ] **Step 3: Upload to Zendesk**

1. Go to **Zendesk Admin Center** → **Apps and integrations** → **Zendesk Support apps**
2. Click **Upload private app**
3. Upload the `.zip` file from the `tmp/` directory
4. Configure the app parameters:
   - **backendUrl**: Your Cloud Run service URL (e.g., `https://zendesk-shopify-backend-xxxxx-ew.a.run.app`)
   - **shared_secret**: The ZAF shared secret (must match the backend's `ZAF_SHARED_SECRET` env var)
5. Enable the app
6. Open a ticket — the sidebar should appear in the right panel

- [ ] **Step 4: Smoke test the deployed app**

Open a ticket for a store that has been configured in the backend. Verify:
- Sidebar loads and shows order data
- Order selector works (if multiple orders)
- Refresh button works
- "Open in Shopify" link opens the correct URL

- [ ] **Step 5: Commit the built bundle**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add sidebar/assets/main.js
git commit -m "chore: build sidebar bundle for deployment"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Backend patch: add shopify_domain to cache | Existing tests updated |
| 2 | ZAF app scaffolding | Manual build check |
| 3 | API module (backend calls with JWT) | 4 unit tests |
| 4 | Poller module (retry logic) | 4 unit tests |
| 5 | UI utilities (escapeHtml, formatDate, formatTimeAgo) | 7 unit tests |
| 6 | UI state rendering (loading, error, empty, unconfigured) | 5 unit tests |
| 7 | UI order display + selector | 6 unit tests |
| 8 | Styles (Zendesk Garden + custom CSS) | — |
| 9 | Main module (full orchestration) | — (integration) |
| 10 | Local development testing | Manual checklist |
| 11 | Package & deploy to Zendesk | Manual smoke test |

**Total: 11 tasks, 26 automated tests + manual testing**
