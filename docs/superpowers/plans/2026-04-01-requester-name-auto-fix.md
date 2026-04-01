# Requester Name Auto-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically fix Zendesk requester names that are auto-derived from email addresses or have bad capitalization, using the customer's real name from Shopify order data.

**Architecture:** Extends the existing webhook flow in `lookupService.js`. After Shopify orders are fetched, checks if the requester name needs fixing and updates the Zendesk user if so. No new Firestore state — the heuristic itself prevents repeat updates.

**Tech Stack:** Node.js, Express, Zendesk REST API, Jest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/services/shopifyClient.js` | Modify | Add `customer_first_name`, `customer_last_name` to normalized order |
| `backend/tests/services/shopifyClient.test.js` | Modify | Update expected output + test fixture |
| `backend/src/services/zendeskClient.js` | Modify | Add `getUser()` and `updateUser()` |
| `backend/tests/services/zendeskClient.test.js` | Modify | Test new methods |
| `backend/src/services/lookupService.js` | Modify | Add name-check logic and call `updateUser()` |
| `backend/tests/services/lookupService.test.js` | Modify | Test name update scenarios |
| `backend/src/services/webhookLogService.js` | Modify | Accept `requesterUpdated` field |
| `backend/tests/services/webhookLogService.test.js` | Modify | Test new field |
| `backend/src/routes/webhook.js` | Modify | Pass `requesterUpdated` to log |
| `backend/tests/routes/webhook.test.js` | Modify | Verify field passthrough |

---

### Task 1: Add customer name to normalized Shopify orders

**Files:**
- Modify: `backend/src/services/shopifyClient.js:44-92` (normalizeOrder)
- Modify: `backend/tests/services/shopifyClient.test.js`

- [ ] **Step 1: Update the test fixture to include customer first/last name**

In `backend/tests/services/shopifyClient.test.js`, update the `SHOPIFY_ORDER` fixture's `customer` object:

```js
customer: {
  first_name: 'John',
  last_name: 'Doe',
  orders_count: 5,
  total_spent: '249.75',
},
```

And update the expected output in the `'fetches and normalizes orders'` test to include:

```js
customer_first_name: 'John',
customer_last_name: 'Doe',
```

(Add these right after the existing `customer_total_spent` line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/services/shopifyClient.test.js --verbose`
Expected: FAIL — output missing `customer_first_name` and `customer_last_name`

- [ ] **Step 3: Add fields to normalizeOrder**

In `backend/src/services/shopifyClient.js`, inside `normalizeOrder()`, add after the `customer_total_spent` line:

```js
customer_first_name: order.customer && order.customer.first_name ? order.customer.first_name : '',
customer_last_name: order.customer && order.customer.last_name ? order.customer.last_name : '',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/services/shopifyClient.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/shopifyClient.js backend/tests/services/shopifyClient.test.js
git commit -m "feat: add customer first/last name to normalized Shopify orders"
```

---

### Task 2: Add getUser and updateUser to zendeskClient

**Files:**
- Modify: `backend/src/services/zendeskClient.js`
- Modify: `backend/tests/services/zendeskClient.test.js`

- [ ] **Step 1: Write tests for getUser and updateUser**

Add these two describe blocks at the end of the `describe('zendeskClient', ...)` block in `backend/tests/services/zendeskClient.test.js`:

```js
describe('getUser', () => {
  test('returns user name', async () => {
    axios.get.mockResolvedValue({
      data: {
        user: {
          id: 11111,
          name: 'Yarek1331',
          email: 'yarek1331@gmail.com',
        },
      },
    });

    const result = await getUser(11111);

    expect(result).toEqual({
      name: 'Yarek1331',
      email: 'yarek1331@gmail.com',
    });
    expect(axios.get).toHaveBeenCalledWith(
      'https://testcompany.zendesk.com/api/v2/users/11111.json',
      expect.any(Object)
    );
  });
});

describe('updateUser', () => {
  test('sends name update to Zendesk API', async () => {
    axios.put.mockResolvedValue({ data: {} });

    await updateUser(11111, { name: 'Yarek Jansen' });

    expect(axios.put).toHaveBeenCalledWith(
      'https://testcompany.zendesk.com/api/v2/users/11111.json',
      { user: { name: 'Yarek Jansen' } },
      expect.any(Object)
    );
  });
});
```

Also update the import at the top of the file to include the new functions:

```js
const {
  getTicket,
  getUserEmails,
  updateTicketFields,
  getUser,
  updateUser,
} = require('../../src/services/zendeskClient');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/services/zendeskClient.test.js --verbose`
Expected: FAIL — `getUser` and `updateUser` are not functions

- [ ] **Step 3: Implement getUser and updateUser**

In `backend/src/services/zendeskClient.js`, add before the `module.exports` line:

```js
async function getUser(userId) {
  const { base, auth } = zendeskApi();
  const response = await axios.get(`${base}/users/${userId}.json`, { auth });
  const user = response.data.user;
  return {
    name: user.name,
    email: user.email,
  };
}

async function updateUser(userId, { name }) {
  const { base, auth } = zendeskApi();
  await axios.put(
    `${base}/users/${userId}.json`,
    { user: { name } },
    { auth }
  );
}
```

Update the `module.exports` to include the new functions:

```js
module.exports = { getTicket, getUserEmails, updateTicketFields, getUser, updateUser };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/services/zendeskClient.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/zendeskClient.js backend/tests/services/zendeskClient.test.js
git commit -m "feat: add getUser and updateUser to zendeskClient"
```

---

### Task 3: Add requester name update logic to lookupService

**Files:**
- Modify: `backend/src/services/lookupService.js`
- Modify: `backend/tests/services/lookupService.test.js`

- [ ] **Step 1: Write tests for name update scenarios**

In `backend/tests/services/lookupService.test.js`, update the `MOCK_ORDER` to include customer name fields:

```js
const MOCK_ORDER = {
  shopify_order_id: '6001234567890',
  order_name: '#1052',
  financial_status: 'paid',
  customer_first_name: 'John',
  customer_last_name: 'Doe',
};
```

Update `setupHappyPath()` to add mocks for the new functions. Add after the existing `zendeskClient.updateTicketFields.mockResolvedValue();` line:

```js
zendeskClient.getUser.mockResolvedValue({
  name: 'john@example.com'.split('@')[0],
  email: 'john@example.com',
});
zendeskClient.updateUser.mockResolvedValue();
```

Wait — that mock would return `{ name: 'john', email: 'john@example.com' }`. For the happy path test, we want to test the auto-derived case. Let's set it up more explicitly:

Replace the above with:

```js
zendeskClient.getUser.mockResolvedValue({
  name: 'john',
  email: 'john@example.com',
});
zendeskClient.updateUser.mockResolvedValue();
```

Then add these tests after the existing tests:

```js
test('updates requester name when auto-derived from email', async () => {
  setupHappyPath();
  zendeskClient.getUser.mockResolvedValue({
    name: 'Yarek1331',
    email: 'yarek1331@gmail.com',
  });

  const result = await lookupOrdersForTicket('98765');

  expect(zendeskClient.updateUser).toHaveBeenCalledWith(11111, {
    name: 'John Doe',
  });
  expect(result.requesterUpdated).toBe('Yarek1331 -> John Doe');
});

test('updates requester name when capitalization is wrong', async () => {
  setupHappyPath();
  zendeskClient.getUser.mockResolvedValue({
    name: 'john doe',
    email: 'john.doe@gmail.com',
  });

  const result = await lookupOrdersForTicket('98765');

  expect(zendeskClient.updateUser).toHaveBeenCalledWith(11111, {
    name: 'John Doe',
  });
  expect(result.requesterUpdated).toBe('john doe -> John Doe');
});

test('does not update requester name when already correct', async () => {
  setupHappyPath();
  zendeskClient.getUser.mockResolvedValue({
    name: 'John Doe',
    email: 'john.doe@gmail.com',
  });

  const result = await lookupOrdersForTicket('98765');

  expect(zendeskClient.updateUser).not.toHaveBeenCalled();
  expect(result.requesterUpdated).toBeUndefined();
});

test('does not update when Shopify has no customer name', async () => {
  setupHappyPath();
  shopifyClient.getOrdersByEmail.mockResolvedValue([{
    ...MOCK_ORDER,
    customer_first_name: '',
    customer_last_name: '',
  }]);
  zendeskClient.getUser.mockResolvedValue({
    name: 'yarek1331',
    email: 'yarek1331@gmail.com',
  });

  const result = await lookupOrdersForTicket('98765');

  expect(zendeskClient.updateUser).not.toHaveBeenCalled();
  expect(result.requesterUpdated).toBeUndefined();
});

test('does not update when no orders found', async () => {
  setupHappyPath();
  shopifyClient.getOrdersByEmail.mockResolvedValue([]);
  zendeskClient.getUser.mockResolvedValue({
    name: 'yarek1331',
    email: 'yarek1331@gmail.com',
  });

  const result = await lookupOrdersForTicket('98765');

  expect(zendeskClient.updateUser).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/services/lookupService.test.js --verbose`
Expected: FAIL — `getUser` not mocked, `requesterUpdated` not in result

- [ ] **Step 3: Implement requester name update logic**

Replace the full contents of `backend/src/services/lookupService.js` with:

```js
const config = require('../config');
const zendeskClient = require('./zendeskClient');
const storeService = require('./storeService');
const secretManager = require('./secretManager');
const shopifyClient = require('./shopifyClient');
const fieldMappingService = require('./fieldMappingService');
const orderCacheService = require('./orderCacheService');
const { logger } = require('../logger');
const lookupLogger = logger.child({ component: 'lookup' });

function isNameAutoDerived(name, email) {
  const localPart = email.split('@')[0];
  return name.toLowerCase() === localPart.toLowerCase();
}

function hasWrongCapitalization(name) {
  const parts = name.trim().split(/\s+/);
  return parts.some(part => part.length > 0 && part[0] !== part[0].toUpperCase());
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildProperName(firstName, lastName) {
  return [capitalize(firstName), capitalize(lastName)].filter(Boolean).join(' ');
}

function needsNameUpdate(currentName, email) {
  return isNameAutoDerived(currentName, email) || hasWrongCapitalization(currentName);
}

async function tryUpdateRequesterName(requesterId, currentName, email, orders) {
  if (orders.length === 0) return undefined;

  const mostRecent = orders[0];
  const firstName = mostRecent.customer_first_name;
  const lastName = mostRecent.customer_last_name;

  if (!firstName && !lastName) return undefined;
  if (!needsNameUpdate(currentName, email)) return undefined;

  const properName = buildProperName(firstName, lastName);

  await zendeskClient.updateUser(requesterId, { name: properName });
  lookupLogger.info('Updated requester name', {
    requesterId,
    oldName: currentName,
    newName: properName,
  });

  return `${currentName} -> ${properName}`;
}

async function lookupOrdersForTicket(ticketId, { emails: overrideEmails } = {}) {
  const ticket = await zendeskClient.getTicket(ticketId);

  if (!ticket.storeName) {
    return { error: 'no_store_name', ticketId };
  }

  const store = await storeService.getStoreByName(ticket.storeName);
  if (!store) {
    return { error: 'store_not_found', ticketId, storeName: ticket.storeName };
  }

  const customerEmails = overrideEmails ||
    await zendeskClient.getUserEmails(ticket.requesterId);

  const apiToken = await secretManager.getSecret(store.secret_name);

  const orderMap = new Map();
  for (const email of customerEmails) {
    const orders = await shopifyClient.getOrdersByEmail({
      shopifyDomain: store.shopify_domain,
      apiToken,
      apiVersion: config.shopifyApiVersion,
      email,
      storeId: store.id,
    });
    for (const order of orders) {
      orderMap.set(order.shopify_order_id, order);
    }
  }

  const allOrders = Array.from(orderMap.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  await orderCacheService.cacheOrders({
    ticketId: String(ticketId),
    storeName: store.store_name,
    shopifyDomain: store.shopify_domain,
    customerEmails,
    orders: allOrders,
  });

  // Update requester name if needed
  let requesterUpdated;
  if (allOrders.length > 0) {
    const user = await zendeskClient.getUser(ticket.requesterId);
    requesterUpdated = await tryUpdateRequesterName(
      ticket.requesterId, user.name, user.email, allOrders
    );
  }

  if (allOrders.length > 0) {
    const mappings = await fieldMappingService.getEnabledMappings();
    const fields = fieldMappingService.buildTicketFields(allOrders[0], mappings);
    await zendeskClient.updateTicketFields(String(ticketId), fields);
  }

  const result = {
    ticketId,
    storeName: store.store_name,
    ordersFound: allOrders.length,
  };

  if (requesterUpdated) {
    result.requesterUpdated = requesterUpdated;
  }

  return result;
}

module.exports = { lookupOrdersForTicket };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/services/lookupService.test.js --verbose`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/lookupService.js backend/tests/services/lookupService.test.js
git commit -m "feat: auto-fix requester name from Shopify customer data"
```

---

### Task 4: Add requesterUpdated to webhook log

**Files:**
- Modify: `backend/src/services/webhookLogService.js`
- Modify: `backend/tests/services/webhookLogService.test.js`

- [ ] **Step 1: Write test for requesterUpdated field**

Add this test to `backend/tests/services/webhookLogService.test.js` inside the existing `describe`:

```js
test('includes requesterUpdated when provided', async () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: 'log2' });

  firestore.collection = jest.fn().mockReturnValue({
    add: mockAdd,
    orderBy: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ size: 50, docs: [] }),
      }),
    }),
    count: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: () => ({ count: 50 }) }),
    }),
  });

  await logWebhookCall({
    ticketId: '456',
    storeName: 'TestStore',
    status: 'success',
    durationMs: 800,
    ordersFound: 1,
    error: null,
    requesterUpdated: 'yarek1331 -> Yarek Jansen',
  });

  expect(mockAdd).toHaveBeenCalledWith(
    expect.objectContaining({
      ticket_id: '456',
      requester_updated: 'yarek1331 -> Yarek Jansen',
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/services/webhookLogService.test.js --verbose`
Expected: FAIL — `requester_updated` not in the logged entry

- [ ] **Step 3: Add requesterUpdated to logWebhookCall**

In `backend/src/services/webhookLogService.js`, update the function signature and entry:

```js
async function logWebhookCall({ ticketId, storeName, status, durationMs, ordersFound, error, requesterUpdated }) {
  const entry = {
    ticket_id: String(ticketId),
    store_name: storeName || null,
    status,
    duration_ms: durationMs,
    orders_found: ordersFound || 0,
    error: error || null,
    requester_updated: requesterUpdated || null,
    timestamp: new Date().toISOString(),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/services/webhookLogService.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/webhookLogService.js backend/tests/services/webhookLogService.test.js
git commit -m "feat: add requesterUpdated field to webhook logs"
```

---

### Task 5: Pass requesterUpdated through webhook route

**Files:**
- Modify: `backend/src/routes/webhook.js`
- Modify: `backend/tests/routes/webhook.test.js`

- [ ] **Step 1: Update webhook route to pass requesterUpdated**

In `backend/src/routes/webhook.js`, in the success branch (the `else` block around line 39), add `requesterUpdated` to the `logWebhookCall` call:

Change:
```js
await logWebhookCall({
  ticketId: String(ticketId),
  storeName: result.storeName,
  status: 'success',
  durationMs,
  ordersFound: result.ordersFound,
  error: null,
}).catch(() => {});
```

To:
```js
await logWebhookCall({
  ticketId: String(ticketId),
  storeName: result.storeName,
  status: 'success',
  durationMs,
  ordersFound: result.ordersFound,
  error: null,
  requesterUpdated: result.requesterUpdated || null,
}).catch(() => {});
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

Run: `cd backend && npx jest --verbose`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/webhook.js
git commit -m "feat: pass requesterUpdated to webhook log"
```

---

### Task 6: Run full test suite and verify

- [ ] **Step 1: Run full test suite**

Run: `cd backend && npx jest --verbose`
Expected: ALL PASS

- [ ] **Step 2: Verify no lint/runtime issues**

Run: `cd backend && node -e "require('./src/services/lookupService')"`
Expected: No errors (module loads cleanly)
