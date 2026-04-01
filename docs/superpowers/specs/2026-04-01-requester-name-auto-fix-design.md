# Zendesk Requester Name Auto-Fix

## Problem

When customers email Zendesk, their requester name is often auto-derived from the email address (e.g. `yarek1331@gmail.com` becomes "Yarek1331"). This looks unprofessional. Additionally, some names have incorrect casing (e.g. "yarek jansen" instead of "Yarek Jansen").

Since the Zendesk-Shopify integration already fetches Shopify orders containing the customer's real name, we can use that data to fix the requester name automatically.

## Solution

During the existing webhook flow, after Shopify orders are fetched, check if the Zendesk requester name needs updating and fix it using the customer name from the most recent Shopify order.

## Update Conditions

A requester name is updated when **either** condition is true:

1. **Auto-derived from email:** The requester name (case-insensitive) matches the local part of their email address. Example: email `yarek1331@gmail.com`, name is "Yarek1331" or "yarek1331".

2. **Bad capitalization:** The name is not auto-derived, but the first letter of the first or last name is not capitalized. Example: "yarek jansen" should become "Yarek Jansen".

In both cases, the Shopify customer name is used (with proper capitalization). If Shopify has no `first_name`/`last_name`, the update is skipped.

## Natural Guard (No Tracking Needed)

Once a requester name is updated, it no longer matches the auto-derived heuristic, and its capitalization is correct. Future tickets from the same requester will pass both checks and be skipped. No Firestore flag or "already updated" tracking is needed.

## Data Flow

```
Webhook fires (existing)
  -> Fetch ticket -> get requesterId, requester name (NEW: fetch user name)
  -> Fetch Shopify orders (existing)
  -> Check requester name against heuristic (NEW)
  -> If update needed: PUT /api/v2/users/{requesterId}.json (NEW)
  -> Update ticket fields (existing)
  -> Log result including requesterUpdated field (NEW)
```

## File Changes

### `backend/src/services/zendeskClient.js`
- Add `getUser(userId)` — returns `{ name }` via `GET /api/v2/users/{userId}.json`
- Add `updateUser(userId, { name })` — `PUT /api/v2/users/{userId}.json`

### `backend/src/services/lookupService.js`
- After fetching orders, get the requester's current name via `getUser()`
- Extract `customer.first_name` and `customer.last_name` from the most recent order
- Add helper `needsNameUpdate(currentName, email)` — returns true if auto-derived or badly cased
- Add helper `buildProperName(firstName, lastName)` — capitalizes first letters
- If update needed, call `updateUser()` and include `requesterUpdated` in the return value

### `backend/src/services/shopifyClient.js`
- Add `customer_first_name` and `customer_last_name` to the `normalizeOrder()` output (data already available via `order.customer`)

### `backend/src/services/webhookLogService.js`
- Add optional `requesterUpdated` field to the log entry (e.g. `"yarek1331 -> Yarek Jansen"`)

### `backend/src/routes/webhook.js`
- Pass `requesterUpdated` from the lookup result through to `logWebhookCall()`

## Zendesk API Calls

- `GET /api/v2/users/{id}.json` — fetch current requester name (one extra call per webhook)
- `PUT /api/v2/users/{id}.json` — update name (only when needed)

Both use existing auth credentials (`ZENDESK_API_TOKEN`). No new secrets or permissions required.

## Edge Cases

- **No orders found:** No Shopify name available, skip update.
- **Shopify customer has no name:** `first_name`/`last_name` empty or null, skip update.
- **Name already correct:** Heuristic checks pass, no API call made.
- **Multiple orders, different names:** Use the most recent order's customer name.
