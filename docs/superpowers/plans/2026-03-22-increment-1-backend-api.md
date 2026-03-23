# Increment 1: Backend API + Firestore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Cloud Run Node.js backend that receives Zendesk webhooks, queries Shopify for order data, caches results in Firestore, and updates Zendesk ticket custom fields.

**Architecture:** Express.js API on Cloud Run with 4 endpoints. Firestore stores store configs, field mappings, order cache, and webhook logs. Secret Manager holds Shopify API tokens. External APIs: Shopify Admin REST API (2025-01) and Zendesk REST API.

**Tech Stack:** Node.js 20+, Express 4, @google-cloud/firestore, @google-cloud/secret-manager, axios, jsonwebtoken, Jest + supertest

**Spec:** `docs/superpowers/specs/2026-03-22-zendesk-shopify-integration-design.md`

---

## Prerequisites

Before starting, ensure:
- Google Cloud project exists with **Firestore**, **Secret Manager**, and **Cloud Run** APIs enabled
- `gcloud` CLI installed and authenticated (`gcloud auth application-default login`)
- Node.js 20+ and npm installed
- A test Shopify store with a **custom app** created (scopes: `read_orders`, `read_customers`) — note the API access token
- Zendesk account with an **API token** (Admin → Channels → API)
- A Zendesk **custom ticket field** for store name — note its field ID (numeric)

---

## File Structure

```
backend/
├── package.json
├── jest.config.js
├── .env.example
├── .gitignore
├── Dockerfile
├── .dockerignore
├── src/
│   ├── index.js                    # Server start
│   ├── app.js                      # Express app factory
│   ├── config.js                   # Environment config
│   ├── firestore.js                # Firestore client singleton
│   ├── services/
│   │   ├── secretManager.js        # GCP Secret Manager reads
│   │   ├── storeService.js         # Store config lookups
│   │   ├── fieldMappingService.js   # Field mapping config
│   │   ├── orderCacheService.js    # Ticket order cache CRUD
│   │   ├── webhookLogService.js    # Webhook activity logging
│   │   ├── shopifyClient.js        # Shopify Admin API calls
│   │   ├── zendeskClient.js        # Zendesk REST API calls
│   │   └── lookupService.js        # Core orchestration
│   ├── routes/
│   │   ├── webhook.js              # POST /webhook/ticket-created
│   │   ├── orders.js               # GET /api/orders
│   │   ├── lookup.js               # POST /api/lookup
│   │   └── selectOrder.js          # POST /api/select-order
│   └── middleware/
│       ├── webhookAuth.js          # Zendesk webhook HMAC check
│       └── zafAuth.js              # ZAF JWT validation
└── tests/
    ├── services/
    │   ├── storeService.test.js
    │   ├── shopifyClient.test.js
    │   ├── zendeskClient.test.js
    │   ├── fieldMappingService.test.js
    │   ├── orderCacheService.test.js
    │   ├── lookupService.test.js
    │   └── webhookLogService.test.js
    ├── routes/
    │   ├── webhook.test.js
    │   ├── orders.test.js
    │   ├── lookup.test.js
    │   └── selectOrder.test.js
    └── middleware/
        ├── webhookAuth.test.js
        └── zafAuth.test.js
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/jest.config.js`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/src/config.js`
- Create: `backend/src/firestore.js`
- Create: `backend/src/app.js`
- Create: `backend/src/index.js`

- [ ] **Step 1: Initialize git repo and npm project**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git init
cd backend  # (create dir first: mkdir -p backend)
npm init -y
```

Update `package.json` scripts:
```json
{
  "name": "zendesk-shopify-backend",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest --verbose",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install express axios @google-cloud/firestore @google-cloud/secret-manager jsonwebtoken
npm install -D jest supertest
```

- [ ] **Step 3: Create config and boilerplate files**

`backend/.gitignore`:
```
node_modules/
.env
coverage/
```

`backend/.env.example`:
```
PORT=8080
GCP_PROJECT_ID=your-project-id
SHOPIFY_API_VERSION=2025-01
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=your-email@example.com
ZENDESK_API_TOKEN=your-api-token
ZENDESK_WEBHOOK_SECRET=your-webhook-signing-secret
ZENDESK_STORE_FIELD_ID=12345678
ZAF_SHARED_SECRET=your-zaf-shared-secret
```

`backend/jest.config.js`:
```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
};
```

`backend/src/config.js`:
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

module.exports = config;
```

`backend/src/firestore.js`:
```js
const { Firestore } = require('@google-cloud/firestore');

const firestore = new Firestore();

module.exports = firestore;
```

- [ ] **Step 4: Create Express app skeleton**

`backend/src/app.js`:
```js
const express = require('express');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

module.exports = createApp;
```

`backend/src/index.js`:
```js
const createApp = require('./app');
const config = require('./config');

const app = createApp();

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
```

- [ ] **Step 5: Verify the app starts and health check works**

```bash
cd backend
node src/index.js &
curl http://localhost:8080/health
# Expected: {"status":"ok"}
kill %1
```

- [ ] **Step 6: Commit**

```bash
cd ~/Zendesk\ -\ Shopify\ app
git add backend/ .gitignore
git commit -m "feat: scaffold backend project with Express app"
```

---

## Task 2: Store Service

**Files:**
- Create: `backend/src/services/storeService.js`
- Create: `backend/tests/services/storeService.test.js`

The store service looks up a store config from Firestore by name. Document ID is the lowercased store name (efficient O(1) lookups, case-insensitive by design).

- [ ] **Step 1: Write the failing test**

`backend/tests/services/storeService.test.js`:
```js
jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { getStoreByName } = require('../../src/services/storeService');

describe('storeService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getStoreByName', () => {
    test('returns store config when found', async () => {
      const mockDoc = {
        exists: true,
        id: 'solitsocks',
        data: () => ({
          store_name: 'SolitSocks',
          shopify_domain: 'solitsocks.myshopify.com',
          secret_name: 'projects/my-project/secrets/shopify-solitsocks/versions/latest',
          is_active: true,
        }),
      };
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      });

      const store = await getStoreByName('SolitSocks');

      expect(firestore.collection).toHaveBeenCalledWith('stores');
      expect(store).toEqual({
        id: 'solitsocks',
        store_name: 'SolitSocks',
        shopify_domain: 'solitsocks.myshopify.com',
        secret_name: 'projects/my-project/secrets/shopify-solitsocks/versions/latest',
        is_active: true,
      });
    });

    test('returns null when store not found', async () => {
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      });

      const store = await getStoreByName('NonExistent');
      expect(store).toBeNull();
    });

    test('returns null when store is inactive', async () => {
      const mockDoc = {
        exists: true,
        id: 'oldstore',
        data: () => ({
          store_name: 'OldStore',
          is_active: false,
        }),
      };
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      });

      const store = await getStoreByName('OldStore');
      expect(store).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/storeService.test.js --verbose
```
Expected: FAIL — `Cannot find module '../../src/services/storeService'`

- [ ] **Step 3: Write the implementation**

`backend/src/services/storeService.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/storeService.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/storeService.js backend/tests/services/storeService.test.js
git commit -m "feat: add store service with Firestore lookup"
```

---

## Task 3: Secret Manager Service

**Files:**
- Create: `backend/src/services/secretManager.js`

No separate test file — this is a thin wrapper around the GCP SDK. We'll mock it at the call site in integration tests.

- [ ] **Step 1: Write the implementation**

`backend/src/services/secretManager.js`:
```js
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();

async function getSecret(secretName) {
  const [version] = await client.accessSecretVersion({ name: secretName });
  return version.payload.data.toString('utf8');
}

module.exports = { getSecret };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/secretManager.js
git commit -m "feat: add Secret Manager service for API token retrieval"
```

---

## Task 4: Shopify Client

**Files:**
- Create: `backend/src/services/shopifyClient.js`
- Create: `backend/tests/services/shopifyClient.test.js`

Queries Shopify Admin REST API for orders by customer email. Parses the response into our normalized format (matching the `ticket_orders.orders[]` schema from the spec).

- [ ] **Step 1: Write the failing test**

`backend/tests/services/shopifyClient.test.js`:
```js
jest.mock('axios');
const axios = require('axios');
const { getOrdersByEmail } = require('../../src/services/shopifyClient');

const SHOPIFY_ORDER = {
  id: 6001234567890,
  name: '#1052',
  email: 'john@example.com',
  created_at: '2026-03-18T14:22:00+01:00',
  closed_at: null,
  cancelled_at: null,
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  total_price: '49.95',
  currency: 'EUR',
  tags: 'vip, repeat-customer',
  note: 'Please gift wrap',
  shipping_address: {
    first_name: 'John',
    last_name: 'Doe',
    address1: 'Kerkstraat 12',
    city: 'Maastricht',
    province: '',
    zip: '6211 AB',
    country: 'Netherlands',
    country_code: 'NL',
  },
  line_items: [
    { title: 'Black Crew Socks', variant_title: 'M', sku: 'BCS-M-001', quantity: 1 },
    { title: 'White Ankle Socks', variant_title: 'L', sku: 'WAS-L-002', quantity: 2 },
  ],
  fulfillments: [
    {
      tracking_number: '3SXYZ123456',
      tracking_url: 'https://tracking.example.com/3SXYZ123456',
    },
  ],
  payment_gateway_names: ['shopify_payments'],
};

describe('shopifyClient', () => {
  afterEach(() => jest.clearAllMocks());

  test('fetches and normalizes orders', async () => {
    axios.get.mockResolvedValue({ data: { orders: [SHOPIFY_ORDER] } });

    const orders = await getOrdersByEmail({
      shopifyDomain: 'solitsocks.myshopify.com',
      apiToken: 'shpat_test123',
      apiVersion: '2025-01',
      email: 'john@example.com',
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://solitsocks.myshopify.com/admin/api/2025-01/orders.json',
      expect.objectContaining({
        params: { email: 'john@example.com', status: 'any', limit: 50 },
      })
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]).toEqual({
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
      payment_method: 'Shopify Payments',
      tags: 'vip, repeat-customer',
      customer_note: 'Please gift wrap',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      line_items: [
        { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1 },
        { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2 },
      ],
    });
  });

  test('returns empty array when no orders found', async () => {
    axios.get.mockResolvedValue({ data: { orders: [] } });

    const orders = await getOrdersByEmail({
      shopifyDomain: 'test.myshopify.com',
      apiToken: 'token',
      apiVersion: '2025-01',
      email: 'nobody@example.com',
    });

    expect(orders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/shopifyClient.test.js --verbose
```
Expected: FAIL — `Cannot find module '../../src/services/shopifyClient'`

- [ ] **Step 3: Write the implementation**

`backend/src/services/shopifyClient.js`:
```js
const axios = require('axios');

const GATEWAY_LABELS = {
  shopify_payments: 'Shopify Payments',
  paypal: 'PayPal',
  manual: 'Manual',
  gift_card: 'Gift Card',
  'cash on delivery (cod)': 'Cash on Delivery',
};

function deriveOrderStatus(order) {
  if (order.cancelled_at) return 'cancelled';
  if (order.closed_at) return 'closed';
  return 'open';
}

function formatShippingAddress(addr) {
  if (!addr) return '';
  const parts = [
    [addr.first_name, addr.last_name].filter(Boolean).join(' '),
    addr.address1,
    addr.address2,
    [addr.zip, addr.city].filter(Boolean).join(' '),
    addr.province,
    addr.country,
  ];
  return parts.filter(Boolean).join('\n');
}

function formatPaymentMethod(gatewayNames) {
  if (!gatewayNames || gatewayNames.length === 0) return 'Unknown';
  const gateway = gatewayNames[0];
  return GATEWAY_LABELS[gateway] || gateway.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeOrder(order) {
  return {
    shopify_order_id: String(order.id),
    order_name: order.name,
    order_status: deriveOrderStatus(order),
    financial_status: order.financial_status || 'unknown',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    total_price: order.total_price,
    currency: order.currency,
    created_at: order.created_at,
    tracking_numbers: (order.fulfillments || [])
      .map(f => f.tracking_number)
      .filter(Boolean),
    tracking_urls: (order.fulfillments || [])
      .map(f => f.tracking_url)
      .filter(Boolean),
    payment_method: formatPaymentMethod(order.payment_gateway_names),
    tags: order.tags || '',
    customer_note: order.note || '',
    shipping_address: formatShippingAddress(order.shipping_address),
    line_items: (order.line_items || []).map(item => ({
      title: [item.title, item.variant_title].filter(Boolean).join(' (') +
        (item.variant_title ? ')' : ''),
      sku: item.sku || '',
      quantity: item.quantity,
    })),
  };
}

async function getOrdersByEmail({ shopifyDomain, apiToken, apiVersion, email }) {
  const url = `https://${shopifyDomain}/admin/api/${apiVersion}/orders.json`;

  const response = await axios.get(url, {
    params: { email, status: 'any', limit: 50 },
    headers: {
      'X-Shopify-Access-Token': apiToken,
      'Content-Type': 'application/json',
    },
  });

  return (response.data.orders || []).map(normalizeOrder);
}

module.exports = { getOrdersByEmail, normalizeOrder };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/shopifyClient.test.js --verbose
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/shopifyClient.js backend/tests/services/shopifyClient.test.js
git commit -m "feat: add Shopify client with order fetching and normalization"
```

---

## Task 5: Zendesk Client

**Files:**
- Create: `backend/src/services/zendeskClient.js`
- Create: `backend/tests/services/zendeskClient.test.js`

Three operations: read ticket (get store name + requester ID), read user (get all emails), update ticket custom fields.

- [ ] **Step 1: Write the failing test**

`backend/tests/services/zendeskClient.test.js`:
```js
jest.mock('axios');
jest.mock('../../src/config', () => ({
  zendeskSubdomain: 'testcompany',
  zendeskEmail: 'agent@test.com',
  zendeskApiToken: 'zdtoken123',
  zendeskStoreFieldId: '9999',
}));

const axios = require('axios');
const {
  getTicket,
  getUserEmails,
  updateTicketFields,
} = require('../../src/services/zendeskClient');

describe('zendeskClient', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getTicket', () => {
    test('returns store name and requester ID', async () => {
      axios.get.mockResolvedValue({
        data: {
          ticket: {
            id: 98765,
            requester_id: 11111,
            custom_fields: [
              { id: 9999, value: 'SolitSocks' },
              { id: 1234, value: 'other' },
            ],
          },
        },
      });

      const result = await getTicket('98765');

      expect(result).toEqual({
        ticketId: 98765,
        requesterId: 11111,
        storeName: 'SolitSocks',
      });
    });

    test('returns null storeName when field not found', async () => {
      axios.get.mockResolvedValue({
        data: {
          ticket: {
            id: 98765,
            requester_id: 11111,
            custom_fields: [{ id: 1234, value: 'other' }],
          },
        },
      });

      const result = await getTicket('98765');
      expect(result.storeName).toBeNull();
    });
  });

  describe('getUserEmails', () => {
    test('returns all verified emails', async () => {
      axios.get.mockResolvedValue({
        data: {
          user: {
            id: 11111,
            email: 'john@example.com',
          },
          identities: [
            { type: 'email', value: 'john@example.com', verified: true },
            { type: 'email', value: 'john.doe@work.com', verified: true },
          ],
        },
      });

      const emails = await getUserEmails(11111);
      expect(emails).toEqual(['john@example.com', 'john.doe@work.com']);
    });
  });

  describe('updateTicketFields', () => {
    test('sends correct payload to Zendesk API', async () => {
      axios.put.mockResolvedValue({ data: {} });

      const fields = [
        { id: '12345', value: '#1052' },
        { id: '12346', value: 'paid' },
      ];

      await updateTicketFields('98765', fields);

      expect(axios.put).toHaveBeenCalledWith(
        'https://testcompany.zendesk.com/api/v2/tickets/98765.json',
        { ticket: { custom_fields: fields } },
        expect.any(Object)
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/zendeskClient.test.js --verbose
```
Expected: FAIL — `Cannot find module '../../src/services/zendeskClient'`

- [ ] **Step 3: Write the implementation**

`backend/src/services/zendeskClient.js`:
```js
const axios = require('axios');
const config = require('../config');

function zendeskApi() {
  const base = `https://${config.zendeskSubdomain}.zendesk.com/api/v2`;
  const auth = {
    username: `${config.zendeskEmail}/token`,
    password: config.zendeskApiToken,
  };
  return { base, auth };
}

async function getTicket(ticketId) {
  const { base, auth } = zendeskApi();
  const response = await axios.get(`${base}/tickets/${ticketId}.json`, { auth });
  const ticket = response.data.ticket;

  const storeFieldId = Number(config.zendeskStoreFieldId);
  const storeField = (ticket.custom_fields || []).find(f => f.id === storeFieldId);

  return {
    ticketId: ticket.id,
    requesterId: ticket.requester_id,
    storeName: storeField ? storeField.value : null,
  };
}

async function getUserEmails(userId) {
  const { base, auth } = zendeskApi();
  const response = await axios.get(`${base}/users/${userId}/identities.json`, { auth });
  const identities = response.data.identities || [];
  return identities
    .filter(i => i.type === 'email' && i.verified)
    .map(i => i.value);
}

async function updateTicketFields(ticketId, customFields) {
  const { base, auth } = zendeskApi();
  await axios.put(
    `${base}/tickets/${ticketId}.json`,
    { ticket: { custom_fields: customFields } },
    { auth }
  );
}

module.exports = { getTicket, getUserEmails, updateTicketFields };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/zendeskClient.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/zendeskClient.js backend/tests/services/zendeskClient.test.js
git commit -m "feat: add Zendesk client for ticket reads and updates"
```

---

## Task 6: Field Mapping Service

**Files:**
- Create: `backend/src/services/fieldMappingService.js`
- Create: `backend/tests/services/fieldMappingService.test.js`

Reads the global field mapping config from Firestore and builds the Zendesk custom field update payload from a normalized order.

- [ ] **Step 1: Write the failing test**

`backend/tests/services/fieldMappingService.test.js`:
```js
jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const {
  getEnabledMappings,
  buildTicketFields,
} = require('../../src/services/fieldMappingService');

const MOCK_MAPPINGS = {
  mappings: [
    { shopify_field: 'order_name', zendesk_field_id: '100', label: 'Order ID', enabled: true },
    { shopify_field: 'financial_status', zendesk_field_id: '101', label: 'Financial Status', enabled: true },
    { shopify_field: 'total_price', zendesk_field_id: '102', label: 'Order Total', enabled: false },
  ],
};

const MOCK_ORDER = {
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
  payment_method: 'Shopify Payments',
  tags: 'vip',
  customer_note: '',
  shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
  line_items: [
    { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1 },
    { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2 },
  ],
};

describe('fieldMappingService', () => {
  afterEach(() => jest.clearAllMocks());

  test('getEnabledMappings returns only enabled mappings', async () => {
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => MOCK_MAPPINGS,
        }),
      }),
    });

    const mappings = await getEnabledMappings();
    expect(mappings).toHaveLength(2);
    expect(mappings.every(m => m.enabled)).toBe(true);
  });

  test('buildTicketFields maps order data to Zendesk field IDs', () => {
    const mappings = MOCK_MAPPINGS.mappings.filter(m => m.enabled);
    const fields = buildTicketFields(MOCK_ORDER, mappings);

    expect(fields).toEqual([
      { id: '100', value: '#1052' },
      { id: '101', value: 'paid' },
    ]);
  });

  test('buildTicketFields handles line items', () => {
    const mappings = [
      { shopify_field: 'line_item_1_title', zendesk_field_id: '200', enabled: true },
      { shopify_field: 'line_item_1_sku', zendesk_field_id: '201', enabled: true },
      { shopify_field: 'line_item_1_quantity', zendesk_field_id: '202', enabled: true },
      { shopify_field: 'line_item_2_title', zendesk_field_id: '203', enabled: true },
    ];

    const fields = buildTicketFields(MOCK_ORDER, mappings);
    expect(fields).toEqual([
      { id: '200', value: 'Black Crew Socks (M)' },
      { id: '201', value: 'BCS-M-001' },
      { id: '202', value: '1' },
      { id: '203', value: 'White Ankle Socks (L)' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/fieldMappingService.test.js --verbose
```
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Write the implementation**

`backend/src/services/fieldMappingService.js`:
```js
const firestore = require('../firestore');

async function getEnabledMappings() {
  const doc = await firestore.collection('field_mappings').doc('global').get();
  if (!doc.exists) return [];
  const data = doc.data();
  return (data.mappings || []).filter(m => m.enabled);
}

// Maps a shopify_field name to the value from a normalized order
function resolveField(order, fieldName) {
  // Direct top-level fields
  const directFields = {
    order_name: order.order_name,
    order_status: order.order_status,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    total_price: `${order.total_price} ${order.currency}`,
    order_date: order.created_at,
    tracking_numbers: (order.tracking_numbers || []).join(', '),
    tracking_urls: (order.tracking_urls || []).join(', '),
    payment_method: order.payment_method,
    tags: order.tags,
    customer_note: order.customer_note,
    shipping_address: order.shipping_address,
  };

  if (fieldName in directFields) {
    return directFields[fieldName];
  }

  // Line item fields: line_item_N_title, line_item_N_sku, line_item_N_quantity
  const lineItemMatch = fieldName.match(/^line_item_(\d+)_(title|sku|quantity)$/);
  if (lineItemMatch) {
    const index = parseInt(lineItemMatch[1], 10) - 1; // 1-based to 0-based
    const prop = lineItemMatch[2];
    const item = (order.line_items || [])[index];
    if (!item) return '';
    return String(item[prop] ?? '');
  }

  return '';
}

function buildTicketFields(order, mappings) {
  return mappings.map(mapping => ({
    id: mapping.zendesk_field_id,
    value: resolveField(order, mapping.shopify_field),
  }));
}

module.exports = { getEnabledMappings, buildTicketFields };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/fieldMappingService.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/fieldMappingService.js backend/tests/services/fieldMappingService.test.js
git commit -m "feat: add field mapping service for Shopify-to-Zendesk field resolution"
```

---

## Task 7: Order Cache Service

**Files:**
- Create: `backend/src/services/orderCacheService.js`
- Create: `backend/tests/services/orderCacheService.test.js`

CRUD operations on the `ticket_orders` collection in Firestore (keyed by ticket ID).

- [ ] **Step 1: Write the failing test**

`backend/tests/services/orderCacheService.test.js`:
```js
jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const {
  getCachedOrders,
  cacheOrders,
} = require('../../src/services/orderCacheService');

describe('orderCacheService', () => {
  afterEach(() => jest.clearAllMocks());

  const mockSet = jest.fn().mockResolvedValue();
  const mockGet = jest.fn();

  beforeEach(() => {
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: mockGet,
        set: mockSet,
      }),
    });
  });

  test('getCachedOrders returns data when cached', async () => {
    const cachedData = {
      ticket_id: '98765',
      store_name: 'SolitSocks',
      selected_order_id: '6001234567890',
      orders: [{ shopify_order_id: '6001234567890', order_name: '#1052' }],
    };
    mockGet.mockResolvedValue({ exists: true, data: () => cachedData });

    const result = await getCachedOrders('98765');
    expect(result).toEqual(cachedData);
  });

  test('getCachedOrders returns null when not cached', async () => {
    mockGet.mockResolvedValue({ exists: false });

    const result = await getCachedOrders('99999');
    expect(result).toBeNull();
  });

  test('cacheOrders writes correct document', async () => {
    const orders = [{ shopify_order_id: '123', order_name: '#1' }];

    await cacheOrders({
      ticketId: '98765',
      storeName: 'SolitSocks',
      customerEmails: ['john@example.com'],
      orders,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '98765',
        store_name: 'SolitSocks',
        customer_emails: ['john@example.com'],
        selected_order_id: '123',
        orders,
      }),
      { merge: true }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/orderCacheService.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/services/orderCacheService.js`:
```js
const firestore = require('../firestore');

async function getCachedOrders(ticketId) {
  const doc = await firestore.collection('ticket_orders').doc(String(ticketId)).get();
  if (!doc.exists) return null;
  return doc.data();
}

async function cacheOrders({ ticketId, storeName, customerEmails, orders }) {
  const selectedOrderId = orders.length > 0 ? orders[0].shopify_order_id : null;

  await firestore.collection('ticket_orders').doc(String(ticketId)).set(
    {
      ticket_id: String(ticketId),
      store_name: storeName,
      customer_emails: customerEmails,
      selected_order_id: selectedOrderId,
      last_synced: new Date().toISOString(),
      orders,
    },
    { merge: true }
  );
}

async function updateSelectedOrder(ticketId, orderId) {
  await firestore.collection('ticket_orders').doc(String(ticketId)).set(
    { selected_order_id: String(orderId) },
    { merge: true }
  );
}

module.exports = { getCachedOrders, cacheOrders, updateSelectedOrder };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/orderCacheService.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/orderCacheService.js backend/tests/services/orderCacheService.test.js
git commit -m "feat: add order cache service for Firestore ticket_orders"
```

---

## Task 8: Lookup Orchestration Service

**Files:**
- Create: `backend/src/services/lookupService.js`
- Create: `backend/tests/services/lookupService.test.js`

This is the core business logic. Given a ticket ID, it: reads the ticket from Zendesk → finds the store → gets the Shopify API token → queries Shopify → caches results → updates Zendesk fields.

- [ ] **Step 1: Write the failing test**

`backend/tests/services/lookupService.test.js`:
```js
jest.mock('../../src/services/zendeskClient');
jest.mock('../../src/services/storeService');
jest.mock('../../src/services/secretManager');
jest.mock('../../src/services/shopifyClient');
jest.mock('../../src/services/fieldMappingService');
jest.mock('../../src/services/orderCacheService');
jest.mock('../../src/config', () => ({
  shopifyApiVersion: '2025-01',
}));

const zendeskClient = require('../../src/services/zendeskClient');
const storeService = require('../../src/services/storeService');
const secretManager = require('../../src/services/secretManager');
const shopifyClient = require('../../src/services/shopifyClient');
const fieldMappingService = require('../../src/services/fieldMappingService');
const orderCacheService = require('../../src/services/orderCacheService');
const { lookupOrdersForTicket } = require('../../src/services/lookupService');

describe('lookupService', () => {
  afterEach(() => jest.clearAllMocks());

  const MOCK_ORDER = {
    shopify_order_id: '6001234567890',
    order_name: '#1052',
    financial_status: 'paid',
  };

  const MOCK_MAPPINGS = [
    { shopify_field: 'order_name', zendesk_field_id: '100', enabled: true },
  ];

  function setupHappyPath() {
    zendeskClient.getTicket.mockResolvedValue({
      ticketId: 98765,
      requesterId: 11111,
      storeName: 'SolitSocks',
    });
    zendeskClient.getUserEmails.mockResolvedValue(['john@example.com']);
    zendeskClient.updateTicketFields.mockResolvedValue();
    storeService.getStoreByName.mockResolvedValue({
      id: 'solitsocks',
      store_name: 'SolitSocks',
      shopify_domain: 'solitsocks.myshopify.com',
      secret_name: 'projects/p/secrets/s/versions/latest',
      is_active: true,
    });
    secretManager.getSecret.mockResolvedValue('shpat_test123');
    shopifyClient.getOrdersByEmail.mockResolvedValue([MOCK_ORDER]);
    fieldMappingService.getEnabledMappings.mockResolvedValue(MOCK_MAPPINGS);
    fieldMappingService.buildTicketFields.mockReturnValue([
      { id: '100', value: '#1052' },
    ]);
    orderCacheService.cacheOrders.mockResolvedValue();
  }

  test('happy path: looks up orders and updates ticket', async () => {
    setupHappyPath();

    const result = await lookupOrdersForTicket('98765');

    expect(storeService.getStoreByName).toHaveBeenCalledWith('SolitSocks');
    expect(secretManager.getSecret).toHaveBeenCalledWith(
      'projects/p/secrets/s/versions/latest'
    );
    expect(shopifyClient.getOrdersByEmail).toHaveBeenCalledWith({
      shopifyDomain: 'solitsocks.myshopify.com',
      apiToken: 'shpat_test123',
      apiVersion: '2025-01',
      email: 'john@example.com',
    });
    expect(orderCacheService.cacheOrders).toHaveBeenCalled();
    expect(zendeskClient.updateTicketFields).toHaveBeenCalledWith('98765', [
      { id: '100', value: '#1052' },
    ]);
    expect(result.ordersFound).toBe(1);
  });

  test('returns error when store not found', async () => {
    zendeskClient.getTicket.mockResolvedValue({
      ticketId: 98765,
      requesterId: 11111,
      storeName: 'Unknown',
    });
    storeService.getStoreByName.mockResolvedValue(null);

    const result = await lookupOrdersForTicket('98765');

    expect(result.error).toBe('store_not_found');
    expect(shopifyClient.getOrdersByEmail).not.toHaveBeenCalled();
  });

  test('returns error when store name field is empty', async () => {
    zendeskClient.getTicket.mockResolvedValue({
      ticketId: 98765,
      requesterId: 11111,
      storeName: null,
    });

    const result = await lookupOrdersForTicket('98765');
    expect(result.error).toBe('no_store_name');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/lookupService.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/services/lookupService.js`:
```js
const config = require('../config');
const zendeskClient = require('./zendeskClient');
const storeService = require('./storeService');
const secretManager = require('./secretManager');
const shopifyClient = require('./shopifyClient');
const fieldMappingService = require('./fieldMappingService');
const orderCacheService = require('./orderCacheService');

async function lookupOrdersForTicket(ticketId, { emails: overrideEmails } = {}) {
  // 1. Read ticket from Zendesk
  const ticket = await zendeskClient.getTicket(ticketId);

  if (!ticket.storeName) {
    return { error: 'no_store_name', ticketId };
  }

  // 2. Find store config
  const store = await storeService.getStoreByName(ticket.storeName);
  if (!store) {
    return { error: 'store_not_found', ticketId, storeName: ticket.storeName };
  }

  // 3. Get customer emails (use override if provided, e.g., for refresh)
  const customerEmails = overrideEmails ||
    await zendeskClient.getUserEmails(ticket.requesterId);

  // 4. Get Shopify API token
  const apiToken = await secretManager.getSecret(store.secret_name);

  // 5. Query Shopify for each email, deduplicate by order ID
  const orderMap = new Map();
  for (const email of customerEmails) {
    const orders = await shopifyClient.getOrdersByEmail({
      shopifyDomain: store.shopify_domain,
      apiToken,
      apiVersion: config.shopifyApiVersion,
      email,
    });
    for (const order of orders) {
      orderMap.set(order.shopify_order_id, order);
    }
  }

  // Sort by created_at descending (most recent first)
  const allOrders = Array.from(orderMap.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // 6. Cache in Firestore
  await orderCacheService.cacheOrders({
    ticketId: String(ticketId),
    storeName: store.store_name,
    customerEmails,
    orders: allOrders,
  });

  // 7. Update Zendesk ticket fields with the most recent order
  if (allOrders.length > 0) {
    const mappings = await fieldMappingService.getEnabledMappings();
    const fields = fieldMappingService.buildTicketFields(allOrders[0], mappings);
    await zendeskClient.updateTicketFields(String(ticketId), fields);
  }

  return {
    ticketId,
    storeName: store.store_name,
    ordersFound: allOrders.length,
  };
}

module.exports = { lookupOrdersForTicket };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/services/lookupService.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/lookupService.js backend/tests/services/lookupService.test.js
git commit -m "feat: add lookup orchestration service (core business logic)"
```

---

## Task 9: Webhook Auth Middleware

**Files:**
- Create: `backend/src/middleware/webhookAuth.js`
- Create: `backend/tests/middleware/webhookAuth.test.js`

Zendesk webhooks include an HMAC-SHA256 signature in the `x-zendesk-webhook-signature` header, computed over the request body using the webhook's signing secret.

- [ ] **Step 1: Write the failing test**

`backend/tests/middleware/webhookAuth.test.js`:
```js
const crypto = require('crypto');

jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-webhook-secret',
}));

const { verifyWebhookSignature } = require('../../src/middleware/webhookAuth');

function makeReq(body, secret) {
  const bodyStr = JSON.stringify(body);
  const timestamp = '2026-03-22T10:00:00Z';
  const signBody = timestamp + bodyStr;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signBody)
    .digest('base64');

  return {
    headers: {
      'x-zendesk-webhook-signature': signature,
      'x-zendesk-webhook-signature-timestamp': timestamp,
    },
    body,
    rawBody: Buffer.from(bodyStr),
  };
}

describe('webhookAuth', () => {
  test('allows valid signature', () => {
    const req = makeReq({ ticket_id: '123' }, 'test-webhook-secret');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyWebhookSignature(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects invalid signature', () => {
    const req = makeReq({ ticket_id: '123' }, 'wrong-secret');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/middleware/webhookAuth.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/middleware/webhookAuth.js`:
```js
const crypto = require('crypto');
const config = require('../config');

function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-zendesk-webhook-signature'];
  const timestamp = req.headers['x-zendesk-webhook-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing webhook signature headers' });
  }

  const body = req.rawBody || JSON.stringify(req.body);
  const signBody = timestamp + body;
  const expected = crypto
    .createHmac('sha256', config.zendeskWebhookSecret)
    .update(signBody)
    .digest('base64');

  const valid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );

  if (!valid) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

module.exports = { verifyWebhookSignature };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/middleware/webhookAuth.test.js --verbose
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/webhookAuth.js backend/tests/middleware/webhookAuth.test.js
git commit -m "feat: add webhook HMAC signature verification middleware"
```

---

## Task 10: ZAF Auth Middleware

**Files:**
- Create: `backend/src/middleware/zafAuth.js`
- Create: `backend/tests/middleware/zafAuth.test.js`

The Zendesk sidebar app sends a JWT in the `Authorization: Bearer <token>` header. Verify it using the ZAF shared secret.

- [ ] **Step 1: Write the failing test**

`backend/tests/middleware/zafAuth.test.js`:
```js
const jwt = require('jsonwebtoken');

jest.mock('../../src/config', () => ({
  zafSharedSecret: 'test-zaf-secret',
}));

const { verifyZafToken } = require('../../src/middleware/zafAuth');

describe('zafAuth', () => {
  const makeReq = (token) => ({
    headers: { authorization: token ? `Bearer ${token}` : undefined },
  });

  test('allows valid JWT', () => {
    const token = jwt.sign({ sub: 'user123' }, 'test-zaf-secret', { expiresIn: '1h' });
    const req = makeReq(token);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyZafToken(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('rejects missing auth header', () => {
    const req = makeReq(null);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyZafToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid JWT', () => {
    const token = jwt.sign({ sub: 'user123' }, 'wrong-secret');
    const req = makeReq(token);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyZafToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/middleware/zafAuth.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/middleware/zafAuth.js`:
```js
const jwt = require('jsonwebtoken');
const config = require('../config');

function verifyZafToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.zafSharedSecret);
    req.zafUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyZafToken };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/middleware/zafAuth.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/zafAuth.js backend/tests/middleware/zafAuth.test.js
git commit -m "feat: add ZAF JWT verification middleware"
```

---

## Task 11: Webhook Route

**Files:**
- Create: `backend/src/routes/webhook.js`
- Create: `backend/tests/routes/webhook.test.js`
- Modify: `backend/src/app.js` — mount the route

`POST /webhook/ticket-created` — receives Zendesk webhook, triggers order lookup.

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/webhook.test.js`:
```js
const crypto = require('crypto');
const request = require('supertest');

jest.mock('../../src/services/lookupService');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
}));

const lookupService = require('../../src/services/lookupService');
const createApp = require('../../src/app');

describe('POST /webhook/ticket-created', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  function signedRequest(body) {
    const bodyStr = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const signature = crypto
      .createHmac('sha256', 'test-secret')
      .update(timestamp + bodyStr)
      .digest('base64');

    return request(app)
      .post('/webhook/ticket-created')
      .set('Content-Type', 'application/json')
      .set('x-zendesk-webhook-signature', signature)
      .set('x-zendesk-webhook-signature-timestamp', timestamp)
      .send(body);
  }

  test('triggers lookup and returns 200', async () => {
    lookupService.lookupOrdersForTicket.mockResolvedValue({
      ticketId: '123',
      ordersFound: 2,
    });

    const res = await signedRequest({ ticket_id: '123' });

    expect(res.status).toBe(200);
    expect(lookupService.lookupOrdersForTicket).toHaveBeenCalledWith('123');
  });

  test('returns 400 when ticket_id missing', async () => {
    const res = await signedRequest({});

    expect(res.status).toBe(400);
  });

  test('returns 401 without valid signature', async () => {
    const res = await request(app)
      .post('/webhook/ticket-created')
      .send({ ticket_id: '123' });

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/routes/webhook.test.js --verbose
```
Expected: FAIL (route doesn't exist yet)

- [ ] **Step 3: Write the route and update app.js**

`backend/src/routes/webhook.js`:
```js
const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');

const router = express.Router();

router.post('/ticket-created', async (req, res) => {
  const ticketId = req.body.ticket_id;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  try {
    const result = await lookupOrdersForTicket(String(ticketId));

    if (result.error) {
      console.warn(`Webhook lookup warning for ticket ${ticketId}: ${result.error}`);
    }

    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error(`Webhook lookup failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
```

Update `backend/src/app.js` — add raw body capture (needed for webhook signature verification) and mount the webhook route:

```js
const express = require('express');
const { verifyWebhookSignature } = require('./middleware/webhookAuth');
const { verifyZafToken } = require('./middleware/zafAuth');
const webhookRouter = require('./routes/webhook');

function createApp() {
  const app = express();

  // Capture raw body for webhook signature verification
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

  return app;
}

module.exports = createApp;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/routes/webhook.test.js --verbose
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/webhook.js backend/src/app.js backend/tests/routes/webhook.test.js
git commit -m "feat: add POST /webhook/ticket-created endpoint"
```

---

## Task 12: Orders Route

**Files:**
- Create: `backend/src/routes/orders.js`
- Create: `backend/tests/routes/orders.test.js`
- Modify: `backend/src/app.js` — mount the route

`GET /api/orders?ticketId=123` — returns cached order data for the sidebar.

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/orders.test.js`:
```js
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/orderCacheService');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const orderCacheService = require('../../src/services/orderCacheService');
const createApp = require('../../src/app');

describe('GET /api/orders', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = jwt.sign({ sub: 'user1' }, 'test-zaf-secret', { expiresIn: '1h' });
  });

  afterEach(() => jest.clearAllMocks());

  test('returns cached orders for a ticket', async () => {
    const cachedData = {
      ticket_id: '123',
      store_name: 'SolitSocks',
      orders: [{ order_name: '#1052' }],
    };
    orderCacheService.getCachedOrders.mockResolvedValue(cachedData);

    const res = await request(app)
      .get('/api/orders?ticketId=123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedData);
  });

  test('returns 404 when no cached data', async () => {
    orderCacheService.getCachedOrders.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/orders?ticketId=999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('returns 400 when ticketId missing', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/orders?ticketId=123');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/routes/orders.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the route and update app.js**

`backend/src/routes/orders.js`:
```js
const express = require('express');
const { getCachedOrders } = require('../services/orderCacheService');

const router = express.Router();

router.get('/', async (req, res) => {
  const { ticketId } = req.query;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticketId query parameter is required' });
  }

  try {
    const data = await getCachedOrders(String(ticketId));

    if (!data) {
      return res.status(404).json({ error: 'No cached data for this ticket' });
    }

    res.json(data);
  } catch (err) {
    console.error(`Failed to get orders for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

module.exports = router;
```

Add to `backend/src/app.js` — add the orders route under `/api/orders` with ZAF auth:

```js
// Add this import at the top:
const ordersRouter = require('./routes/orders');

// Add this line after the webhook route mount:
app.use('/api/orders', verifyZafToken, ordersRouter);
```

(Full updated app.js shown in Task 14.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/routes/orders.test.js --verbose
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/orders.js backend/src/app.js backend/tests/routes/orders.test.js
git commit -m "feat: add GET /api/orders endpoint for cached order retrieval"
```

---

## Task 13: Lookup Route

**Files:**
- Create: `backend/src/routes/lookup.js`
- Create: `backend/tests/routes/lookup.test.js`
- Modify: `backend/src/app.js` — mount the route

`POST /api/lookup` — manual refresh triggered by the sidebar. Re-queries Shopify using all emails from the Zendesk user profile.

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/lookup.test.js`:
```js
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/lookupService');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const lookupService = require('../../src/services/lookupService');
const createApp = require('../../src/app');

describe('POST /api/lookup', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = jwt.sign({ sub: 'user1' }, 'test-zaf-secret', { expiresIn: '1h' });
  });

  afterEach(() => jest.clearAllMocks());

  test('triggers lookup and returns result', async () => {
    lookupService.lookupOrdersForTicket.mockResolvedValue({
      ticketId: '123',
      ordersFound: 3,
    });

    const res = await request(app)
      .post('/api/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketId: '123' });

    expect(res.status).toBe(200);
    expect(lookupService.lookupOrdersForTicket).toHaveBeenCalledWith('123');
    expect(res.body.ordersFound).toBe(3);
  });

  test('returns 400 when ticketId missing', async () => {
    const res = await request(app)
      .post('/api/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/routes/lookup.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the route**

`backend/src/routes/lookup.js`:
```js
const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticketId is required' });
  }

  try {
    const result = await lookupOrdersForTicket(String(ticketId));
    res.json(result);
  } catch (err) {
    console.error(`Manual lookup failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
```

Mount in `app.js` (see Task 14 for full app.js).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest tests/routes/lookup.test.js --verbose
```
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/lookup.js backend/src/app.js backend/tests/routes/lookup.test.js
git commit -m "feat: add POST /api/lookup endpoint for manual refresh"
```

---

## Task 14: Select Order Route

**Files:**
- Create: `backend/src/routes/selectOrder.js`
- Create: `backend/tests/routes/selectOrder.test.js`
- Modify: `backend/src/app.js` — mount the route + finalize all routes

`POST /api/select-order` — agent selects a different order from the dropdown; update Zendesk fields from cache.

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/selectOrder.test.js`:
```js
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/orderCacheService');
jest.mock('../../src/services/fieldMappingService');
jest.mock('../../src/services/zendeskClient');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const orderCacheService = require('../../src/services/orderCacheService');
const fieldMappingService = require('../../src/services/fieldMappingService');
const zendeskClient = require('../../src/services/zendeskClient');
const createApp = require('../../src/app');

describe('POST /api/select-order', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = jwt.sign({ sub: 'user1' }, 'test-zaf-secret', { expiresIn: '1h' });
  });

  afterEach(() => jest.clearAllMocks());

  test('selects order from cache and updates Zendesk', async () => {
    const cachedData = {
      orders: [
        { shopify_order_id: '111', order_name: '#1', financial_status: 'paid' },
        { shopify_order_id: '222', order_name: '#2', financial_status: 'refunded' },
      ],
    };
    orderCacheService.getCachedOrders.mockResolvedValue(cachedData);
    orderCacheService.updateSelectedOrder.mockResolvedValue();
    fieldMappingService.getEnabledMappings.mockResolvedValue([
      { shopify_field: 'order_name', zendesk_field_id: '100', enabled: true },
    ]);
    fieldMappingService.buildTicketFields.mockReturnValue([
      { id: '100', value: '#2' },
    ]);
    zendeskClient.updateTicketFields.mockResolvedValue();

    const res = await request(app)
      .post('/api/select-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketId: '123', orderId: '222' });

    expect(res.status).toBe(200);
    expect(orderCacheService.updateSelectedOrder).toHaveBeenCalledWith('123', '222');
    expect(zendeskClient.updateTicketFields).toHaveBeenCalled();
  });

  test('returns 404 when order not in cache', async () => {
    orderCacheService.getCachedOrders.mockResolvedValue({
      orders: [{ shopify_order_id: '111' }],
    });

    const res = await request(app)
      .post('/api/select-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketId: '123', orderId: '999' });

    expect(res.status).toBe(404);
  });

  test('returns 400 when params missing', async () => {
    const res = await request(app)
      .post('/api/select-order')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/routes/selectOrder.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the route**

`backend/src/routes/selectOrder.js`:
```js
const express = require('express');
const { getCachedOrders, updateSelectedOrder } = require('../services/orderCacheService');
const { getEnabledMappings, buildTicketFields } = require('../services/fieldMappingService');
const { updateTicketFields } = require('../services/zendeskClient');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticketId, orderId } = req.body;

  if (!ticketId || !orderId) {
    return res.status(400).json({ error: 'ticketId and orderId are required' });
  }

  try {
    const cached = await getCachedOrders(String(ticketId));
    if (!cached) {
      return res.status(404).json({ error: 'No cached data for this ticket' });
    }

    const order = cached.orders.find(o => o.shopify_order_id === String(orderId));
    if (!order) {
      return res.status(404).json({ error: 'Order not found in cache' });
    }

    // Update selected order in cache
    await updateSelectedOrder(String(ticketId), String(orderId));

    // Update Zendesk ticket fields
    const mappings = await getEnabledMappings();
    const fields = buildTicketFields(order, mappings);
    await updateTicketFields(String(ticketId), fields);

    res.json({ status: 'ok', selectedOrderId: orderId });
  } catch (err) {
    console.error(`Select order failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Failed to select order' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Finalize app.js with all routes mounted**

`backend/src/app.js` (complete final version):
```js
const express = require('express');
const { verifyWebhookSignature } = require('./middleware/webhookAuth');
const { verifyZafToken } = require('./middleware/zafAuth');
const webhookRouter = require('./routes/webhook');
const ordersRouter = require('./routes/orders');
const lookupRouter = require('./routes/lookup');
const selectOrderRouter = require('./routes/selectOrder');

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

  return app;
}

module.exports = createApp;
```

- [ ] **Step 5: Run all route tests**

```bash
cd backend && npx jest tests/routes/ --verbose
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/selectOrder.js backend/src/app.js backend/tests/routes/selectOrder.test.js
git commit -m "feat: add POST /api/select-order endpoint and finalize route wiring"
```

---

## Task 15: Webhook Logging Service

**Files:**
- Create: `backend/src/services/webhookLogService.js`
- Create: `backend/tests/services/webhookLogService.test.js`
- Modify: `backend/src/routes/webhook.js` — add logging

Log each webhook call to Firestore `webhook_logs` collection. Auto-prune to keep the last 100 entries.

- [ ] **Step 1: Write the failing test**

`backend/tests/services/webhookLogService.test.js`:
```js
jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { logWebhookCall } = require('../../src/services/webhookLogService');

describe('webhookLogService', () => {
  afterEach(() => jest.clearAllMocks());

  test('writes log entry to Firestore', async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: 'log1' });
    const mockGet = jest.fn().mockResolvedValue({ size: 50, docs: [] });

    firestore.collection = jest.fn().mockReturnValue({
      add: mockAdd,
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: mockGet,
        }),
      }),
      count: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: () => ({ count: 50 }) }),
      }),
    });

    await logWebhookCall({
      ticketId: '123',
      storeName: 'SolitSocks',
      status: 'success',
      durationMs: 1200,
      ordersFound: 3,
      error: null,
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '123',
        store_name: 'SolitSocks',
        status: 'success',
        duration_ms: 1200,
        orders_found: 3,
        error: null,
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest tests/services/webhookLogService.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write the implementation**

`backend/src/services/webhookLogService.js`:
```js
const firestore = require('../firestore');

const COLLECTION = 'webhook_logs';
const MAX_LOGS = 100;

async function logWebhookCall({ ticketId, storeName, status, durationMs, ordersFound, error }) {
  const entry = {
    ticket_id: String(ticketId),
    store_name: storeName || null,
    status,
    duration_ms: durationMs,
    orders_found: ordersFound || 0,
    error: error || null,
    timestamp: new Date().toISOString(),
  };

  await firestore.collection(COLLECTION).add(entry);

  // Prune old entries beyond MAX_LOGS (fire-and-forget)
  pruneOldLogs().catch(err =>
    console.warn('Failed to prune webhook logs:', err.message)
  );
}

async function pruneOldLogs() {
  const countSnap = await firestore.collection(COLLECTION).count().get();
  const totalCount = countSnap.data().count;

  if (totalCount <= MAX_LOGS) return;

  const toDelete = totalCount - MAX_LOGS;
  const oldDocs = await firestore
    .collection(COLLECTION)
    .orderBy('timestamp', 'asc')
    .limit(toDelete)
    .get();

  const batch = firestore.batch();
  oldDocs.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

module.exports = { logWebhookCall };
```

- [ ] **Step 4: Update webhook route to log calls**

Add timing and logging to `backend/src/routes/webhook.js`:

```js
const express = require('express');
const { lookupOrdersForTicket } = require('../services/lookupService');
const { logWebhookCall } = require('../services/webhookLogService');

const router = express.Router();

router.post('/ticket-created', async (req, res) => {
  const ticketId = req.body.ticket_id;
  const startTime = Date.now();

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  try {
    const result = await lookupOrdersForTicket(String(ticketId));
    const durationMs = Date.now() - startTime;

    // Log asynchronously — don't block the response
    logWebhookCall({
      ticketId,
      storeName: result.storeName || null,
      status: result.error ? 'warning' : 'success',
      durationMs,
      ordersFound: result.ordersFound || 0,
      error: result.error || null,
    }).catch(err => console.warn('Failed to log webhook call:', err.message));

    if (result.error) {
      console.warn(`Webhook lookup warning for ticket ${ticketId}: ${result.error}`);
    }

    res.json({ status: 'ok', ...result });
  } catch (err) {
    const durationMs = Date.now() - startTime;

    logWebhookCall({
      ticketId,
      storeName: null,
      status: 'error',
      durationMs,
      ordersFound: 0,
      error: err.message,
    }).catch(logErr => console.warn('Failed to log webhook error:', logErr.message));

    console.error(`Webhook lookup failed for ticket ${ticketId}:`, err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

module.exports = router;
```

- [ ] **Step 5: Run tests**

```bash
cd backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/webhookLogService.js backend/tests/services/webhookLogService.test.js backend/src/routes/webhook.js
git commit -m "feat: add webhook logging with auto-pruning"
```

---

## Task 16: Dockerfile and Cloud Run Config

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create Dockerfile**

`backend/Dockerfile`:
```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 8080

CMD ["node", "src/index.js"]
```

`backend/.dockerignore`:
```
node_modules
tests
coverage
.env
.git
*.md
```

- [ ] **Step 2: Build and test locally**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend
docker build -t zendesk-shopify-backend .
docker run -p 8080:8080 --rm zendesk-shopify-backend &
curl http://localhost:8080/health
# Expected: {"status":"ok"}
docker stop $(docker ps -q --filter ancestor=zendesk-shopify-backend)
```

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat: add Dockerfile for Cloud Run deployment"
```

---

## Task 17: Deploy to Cloud Run

**Files:** None (deployment commands only)

**Prerequisites:** GCP project with Cloud Run, Firestore, and Secret Manager APIs enabled. Store at least one Shopify API token in Secret Manager.

- [ ] **Step 1: Set GCP project and enable APIs**

```bash
export GCP_PROJECT=your-project-id

gcloud config set project $GCP_PROJECT
gcloud services enable run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com
```

- [ ] **Step 2: Store a test Shopify API token in Secret Manager**

```bash
echo -n "shpat_your_test_token" | gcloud secrets create shopify-teststore --data-file=-
```

- [ ] **Step 3: Seed Firestore with a test store and field mapping**

Use the Firebase/Firestore console or the gcloud CLI to create:

**`stores` collection → document `teststore`:**
```json
{
  "store_name": "TestStore",
  "shopify_domain": "teststore.myshopify.com",
  "secret_name": "projects/YOUR_PROJECT/secrets/shopify-teststore/versions/latest",
  "is_active": true,
  "created_at": "2026-03-22T10:00:00Z",
  "last_successful_sync": null,
  "last_error": null
}
```

**`field_mappings` collection → document `global`:**
```json
{
  "mappings": [
    { "shopify_field": "order_name", "zendesk_field_id": "YOUR_FIELD_ID", "label": "Order ID", "enabled": true },
    { "shopify_field": "financial_status", "zendesk_field_id": "YOUR_FIELD_ID", "label": "Financial Status", "enabled": true },
    { "shopify_field": "fulfillment_status", "zendesk_field_id": "YOUR_FIELD_ID", "label": "Fulfillment Status", "enabled": true }
  ]
}
```

Replace `YOUR_FIELD_ID` values with actual Zendesk custom field IDs.

- [ ] **Step 4: Deploy to Cloud Run**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend

gcloud run deploy zendesk-shopify-backend \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=$GCP_PROJECT,SHOPIFY_API_VERSION=2025-01,ZENDESK_SUBDOMAIN=your-subdomain,ZENDESK_EMAIL=your-email,ZENDESK_STORE_FIELD_ID=your-field-id" \
  --set-secrets "ZENDESK_API_TOKEN=zendesk-api-token:latest,ZENDESK_WEBHOOK_SECRET=zendesk-webhook-secret:latest,ZAF_SHARED_SECRET=zaf-shared-secret:latest"
```

Note: Store Zendesk API token, webhook secret, and ZAF secret in Secret Manager first:
```bash
echo -n "your-zendesk-token" | gcloud secrets create zendesk-api-token --data-file=-
echo -n "your-webhook-secret" | gcloud secrets create zendesk-webhook-secret --data-file=-
echo -n "your-zaf-secret" | gcloud secrets create zaf-shared-secret --data-file=-
```

- [ ] **Step 5: Smoke test the deployment**

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe zendesk-shopify-backend --region europe-west1 --format 'value(status.url)')

# Health check
curl $SERVICE_URL/health
# Expected: {"status":"ok"}
```

- [ ] **Step 6: Run all tests one final time**

```bash
cd ~/Zendesk\ -\ Shopify\ app/backend && npx jest --verbose
```
Expected: All tests PASS

- [ ] **Step 7: Commit any deployment config changes**

```bash
git add -A
git commit -m "chore: deployment configuration and seed data instructions"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Project scaffolding + Express app | Manual health check |
| 2 | Store service (Firestore lookup) | 3 unit tests |
| 3 | Secret Manager service | — (thin wrapper) |
| 4 | Shopify client (order fetch + normalize) | 2 unit tests |
| 5 | Zendesk client (ticket/user/update) | 4 unit tests |
| 6 | Field mapping service | 3 unit tests |
| 7 | Order cache service | 3 unit tests |
| 8 | Lookup orchestration (core logic) | 3 unit tests |
| 9 | Webhook auth middleware | 2 unit tests |
| 10 | ZAF auth middleware | 3 unit tests |
| 11 | POST /webhook/ticket-created | 3 integration tests |
| 12 | GET /api/orders | 4 integration tests |
| 13 | POST /api/lookup | 2 integration tests |
| 14 | POST /api/select-order | 3 integration tests |
| 15 | Webhook logging | 1 unit test |
| 16 | Dockerfile | Manual build + health check |
| 17 | Deploy to Cloud Run | Manual smoke test |

**Total: 17 tasks, ~36 automated tests**
