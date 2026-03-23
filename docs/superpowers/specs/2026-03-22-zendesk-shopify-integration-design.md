# Zendesk-Shopify Integration — Design Spec

> Replaces ChannelReply with a custom solution for pulling Shopify order data into Zendesk tickets.

## Problem

Backbone Customer Service uses ChannelReply to bridge Shopify stores and Zendesk. With 66+ stores (scaling to 200), ChannelReply is too slow, lacks key data fields (e.g., payment method), and cannot re-trigger data pulls when a new email is added to a Zendesk user profile.

## Solution

A custom integration consisting of:
1. **Cloud Run backend** (Node.js) — handles Shopify API queries, Zendesk ticket updates, and caching
2. **Zendesk sidebar app** (ZAF) — displays order data in the agent's context panel
3. **Admin web UI** — manage store connections and field mappings

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       ZENDESK                           │
│                                                         │
│  ┌──────────────┐    ┌─────────────────────────────┐    │
│  │   Trigger    │    │     Sidebar App              │    │
│  │ (on ticket   │    │  • Shows all orders          │    │
│  │  creation)   │    │  • Switch between orders     │    │
│  │      │       │    │  • "Refresh" button          │    │
│  │      ▼       │    │  • "Open in Shopify" link    │    │
│  │  Webhook ────┼────┼──► calls backend too         │    │
│  └──────────────┘    └─────────────────────────────┘    │
└────────────┬─────────────────────┬──────────────────────┘
             │                     │
             ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│                  GOOGLE CLOUD                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Cloud Run (Node.js API)               │    │
│  │                                                 │    │
│  │  POST /webhook/ticket-created                   │    │
│  │    → lookup store → query Shopify → update ZD   │    │
│  │                                                 │    │
│  │  POST /api/lookup                               │    │
│  │    → manual lookup (sidebar refresh/new email)  │    │
│  │                                                 │    │
│  │  GET  /api/orders/:ticketId                     │    │
│  │    → return cached order data for sidebar       │    │
│  │                                                 │    │
│  │  POST /api/select-order                         │    │
│  │    → update ticket fields with selected order   │    │
│  │                                                 │    │
│  │  CRUD /api/stores                               │    │
│  │    → admin: manage store connections            │    │
│  │                                                 │    │
│  │  Admin UI (React, served from same service)     │    │
│  └──────────────┬──────────────────────────────────┘    │
│                 │                                       │
│  ┌──────────────▼──────────────────────────────────┐    │
│  │          Firestore                              │    │
│  │  • Store configs (name, domain, API key ref)    │    │
│  │  • Field mappings (global config)               │    │
│  │  • Cached order data per ticket                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Secret Manager                         │    │
│  │  • Shopify API tokens per store                 │    │
│  │  • Zendesk API token                            │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                    SHOPIFY STORES                        │
│  Store 1, Store 2, ... Store N (66 now, scaling to 200) │
│  (queried via Admin API using per-store access tokens)  │
└─────────────────────────────────────────────────────────┘
```

## Store Identification

Each Shopify store has a dedicated customer service email address that forwards to a unique Zendesk forwarding address. When a ticket is created, Zendesk already prefills a **custom ticket field** with the store name (this is existing behavior, configured via Zendesk triggers based on the receiving email address).

### Matching logic

- The store name value in the Zendesk ticket field must **exactly match** the `store_name` field in Firestore (case-insensitive comparison)
- During store onboarding in the admin UI, the admin enters the store name exactly as it appears in the Zendesk trigger
- If no matching store is found, the webhook logs a warning and skips processing. The sidebar shows "Store not configured — contact admin"

## Data Flows

### Flow 1: Automatic — Ticket Creation

1. Customer emails a store's CS address → Zendesk creates ticket with store name prefilled (via existing Zendesk trigger)
2. Zendesk trigger fires webhook → Cloud Run `POST /webhook/ticket-created`
3. Webhook payload includes the ticket ID. Cloud Run fetches the full ticket via Zendesk API to read the store name field and requester email
4. Cloud Run looks up the store config in Firestore (case-insensitive match on `store_name`) → retrieves Shopify API token from Secret Manager
5. Queries Shopify Admin API (REST, API version `2025-01`): `GET /orders.json?email=customer@email.com&status=any`
6. Picks the most recent order → writes order data to Zendesk ticket custom fields via Zendesk API
7. Caches **all** orders for this customer in Firestore (keyed by ticket ID), including a `last_synced` timestamp
8. Target: complete within 2 seconds

**If the webhook processing takes longer than 2 seconds** (e.g., cold start, slow Shopify response), the agent may open the ticket before data is ready. In this case, the sidebar shows a loading spinner and polls `GET /api/orders?ticketId={id}` every 2 seconds (max 5 retries) until data appears, then renders. If no data after 5 retries, shows "Data not yet available — click Refresh."

**Webhook reliability:** Zendesk webhooks are fire-and-forget with limited retries. If the webhook fails (5xx), the data simply won't be pre-cached. The sidebar handles this gracefully: if no cached data exists, it triggers a live lookup automatically (same as a manual refresh). This means the agent always gets data — it may just take a moment longer on the first load if the webhook failed.

**Duplicate webhooks:** The backend is idempotent — processing the same ticket ID twice simply overwrites the cache with the same data. No harm done.

### Flow 2: Sidebar Load — Agent Opens Ticket

1. Agent opens ticket → sidebar app loads in context panel
2. Sidebar calls Cloud Run: `GET /api/orders?ticketId={id}`
3. If cached data exists in Firestore → return immediately, sidebar renders
4. If no cached data exists (webhook failed or hasn't completed yet) → sidebar shows loading spinner and polls (see Flow 1 fallback), or triggers a live lookup automatically

### Flow 3: Manual Refresh — New Email or Stale Data

1. Agent adds a second email to the Zendesk user profile (or wants fresh data)
2. Agent clicks "Refresh" in sidebar
3. Sidebar calls Cloud Run: `POST /api/lookup` with body `{ ticketId: "123" }`
4. Cloud Run reads the ticket to get the store name, then fetches the Zendesk user profile to get all emails
5. Queries Shopify for orders matching **any** of those emails — only queries the store associated with this ticket (not all stores)
6. Updates Zendesk ticket custom fields + Firestore cache (with updated `last_synced` timestamp)
7. Sidebar re-renders with updated data

### Flow 4: Agent Switches Order

1. Agent selects a different order from the dropdown in the sidebar
2. Sidebar calls Cloud Run: `POST /api/select-order` with body `{ ticketId: "123", orderId: "6001234567890" }` (orderId is the numeric Shopify internal order ID)
3. Cloud Run reads the selected order from Firestore cache (no Shopify API call)
4. Updates Zendesk ticket custom fields with the selected order's data
5. Sidebar confirms the update

**Concurrency note:** If two agents view the same ticket and select different orders, last write wins. Acceptable at this scale.

## Shopify Data Fields

Global configuration — same fields pulled for all stores. Configurable via admin UI (enable/disable per field).

| Shopify Data | Zendesk Field Type | Notes |
|---|---|---|
| Order ID / Name (#1001) | Text | Human-readable order number |
| Order Status | Dropdown | open, closed, cancelled |
| Financial Status | Dropdown | paid, partially_refunded, refunded, pending |
| Fulfillment Status | Dropdown | fulfilled, partial, unfulfilled |
| Order Total | Text | Including currency (e.g., "€49.95 EUR") |
| Order Date | Text | When the order was placed |
| Tracking Number(s) | Text | Comma-separated if multiple fulfillments |
| Tracking URL(s) | Text | Comma-separated if multiple fulfillments |
| Payment Method | Text | Generic name only (e.g., "Credit Card", "PayPal", "iDEAL") — no card details |
| Order Tags | Text | Comma-separated Shopify tags |
| Product 1 - Title | Text | First line item title |
| Product 1 - SKU | Text | First line item SKU |
| Product 1 - Quantity | Text | First line item quantity |
| Product 2 - Title | Text | Second line item |
| Product 2 - SKU | Text | |
| Product 2 - Quantity | Text | |
| Product 3 - Title | Text | Third line item |
| Product 3 - SKU | Text | |
| Product 3 - Quantity | Text | |
| Product 4 - Title | Text | Fourth line item |
| Product 4 - SKU | Text | |
| Product 4 - Quantity | Text | |
| Product 5 - Title | Text | Fifth line item |
| Product 5 - SKU | Text | |
| Product 5 - Quantity | Text | |
| Shipping Address | Text | Full formatted address |
| Customer Note | Text | Note left by customer at checkout |

Orders with more than 5 line items: first 5 shown in ticket fields, all items visible in sidebar.

## Zendesk Sidebar App

### Layout

```
┌─────────────────────────────────┐
│  Shopify Order Data             │
│                                 │
│  Store: SolitSocks              │
│  Customer: john@example.com     │
│                                 │
│  ┌─ Order Selector ──────────┐  │
│  │ ▼ #1052 (Mar 18, 2026)   │  │
│  │   #1031 (Feb 2, 2026)    │  │
│  │   #998 (Dec 15, 2025)    │  │
│  └───────────────────────────┘  │
│                                 │
│  Status: Open                   │
│  Payment: Paid                  │
│  Fulfillment: Fulfilled         │
│  Total: €49.95 EUR              │
│  Payment Method: Credit Card    │
│  Date: Mar 18, 2026             │
│                                 │
│  Tracking:                      │
│  3SXYZ123456 (clickable link)   │
│                                 │
│  Products:                      │
│  1x Black Crew Socks (M)       │
│  2x White Ankle Socks (L)      │
│                                 │
│  Shipping:                      │
│  John Doe                       │
│  Kerkstraat 12                  │
│  6211 AB Maastricht, NL         │
│                                 │
│  Tags: vip, repeat-customer     │
│  Note: "Please gift wrap"       │
│                                 │
│  ┌───────────┐ ┌─────────────┐  │
│  │  Refresh  │ │ Open in      │  │
│  │           │ │ Shopify ↗    │  │
│  └───────────┘ └─────────────┘  │
│                                 │
│  Last synced: 2 min ago         │
└─────────────────────────────────┘
```

### Interactions

- **Order selector dropdown** — switching orders updates ticket custom fields via backend (reads from Firestore cache, no Shopify API call)
- **Refresh button** — re-queries Shopify using all emails from the Zendesk user profile
- **Open in Shopify** — direct link to the order in Shopify admin (`https://{shopify_domain}/admin/orders/{shopify_order_id}`). The Shopify internal order ID (numeric) is stored in the cache alongside the order name.
- **Last synced** — timestamp of when data was last pulled from Shopify

### Edge Cases

- **No orders found:** "No Shopify orders found for this customer" with Refresh button
- **Store not connected:** "Store not configured — contact admin"
- **API error:** "Could not fetch order data — try Refresh" with error details in console

## Admin Web UI

Hosted on the same Cloud Run service. Secured with Google Identity Platform (Google login, whitelisted email addresses).

### Features

**Store Management:**
- Add new store: Shopify domain, store display name, API access token
- Edit / remove existing stores
- "Test Connection" button — verifies the API token works and can access orders
- Shows last successful sync per store

**Field Mapping (Global):**
- Single config for all stores
- Toggle individual fields on/off
- Map each Shopify field to a Zendesk custom field ID

**Monitoring:**
- Recent webhook activity log (last 100 calls)
- Success/failure counts
- Error details for failed lookups (e.g., expired API token, store not found)

**User Access:**
- Google login required
- Whitelist of allowed email addresses (managed in Firestore)
- Any whitelisted user has full admin access (no role-based permissions needed at this scale)

## Tech Stack

| Component | Technology | Reason |
|---|---|---|
| Backend API | Node.js on Cloud Run | Multiple endpoints, scales to zero, cost-effective |
| Database | Firestore | Serverless, no maintenance, good for document-style data |
| Secrets | Google Secret Manager | Encrypted storage for API tokens |
| Admin Frontend | React (lightweight) | Served from same Cloud Run service |
| Zendesk App | ZAF (HTML/JS/CSS) | Native Zendesk sidebar app, deployed via ZCLI |
| Auth (Admin) | Google Identity Platform | Google login, email whitelist |

## Security

- Shopify API tokens stored in Secret Manager — never exposed to browser or sidebar app
- Zendesk webhook verified via shared secret (signature validation)
- Sidebar → Backend authenticated via Zendesk JWT (provided by ZAF automatically)
- Admin UI restricted to whitelisted Google accounts
- All traffic over HTTPS
- Payment method shows generic type only (e.g., "Credit Card") — no card numbers or details

## Estimated Costs (at 200 stores)

| Component | Monthly Cost |
|---|---|
| Cloud Run | ~$5-15 (scales to zero when idle) |
| Firestore | ~$1-5 (low volume reads/writes) |
| Secret Manager | ~$1 |
| **Total** | **~$10-20/month** |

## Firestore Data Model

### Collections

**`stores`** — one document per connected Shopify store
```json
{
  "store_name": "SolitSocks",
  "shopify_domain": "solitsocks.myshopify.com",
  "secret_name": "projects/PROJECT/secrets/shopify-solitsocks/versions/latest",
  "is_active": true,
  "last_successful_sync": "2026-03-22T10:30:00Z",
  "last_error": null,
  "created_at": "2026-01-15T09:00:00Z"
}
```

**`field_mappings`** — single document `global` with the field config
```json
{
  "mappings": [
    {
      "shopify_field": "name",
      "zendesk_field_id": "12345",
      "label": "Order ID",
      "enabled": true
    },
    {
      "shopify_field": "financial_status",
      "zendesk_field_id": "12346",
      "label": "Financial Status",
      "enabled": true
    }
  ]
}
```

**`ticket_orders`** — one document per ticket (keyed by ticket ID)
```json
{
  "ticket_id": "98765",
  "store_name": "SolitSocks",
  "customer_emails": ["john@example.com"],
  "selected_order_id": "6001234567890",
  "last_synced": "2026-03-22T10:30:00Z",
  "orders": [
    {
      "shopify_order_id": "6001234567890",
      "order_name": "#1052",
      "order_status": "open",
      "financial_status": "paid",
      "fulfillment_status": "fulfilled",
      "total_price": "49.95",
      "currency": "EUR",
      "created_at": "2026-03-18T14:22:00Z",
      "tracking_numbers": ["3SXYZ123456"],
      "tracking_urls": ["https://tracking.example.com/3SXYZ123456"],
      "payment_method": "Credit Card",
      "tags": "vip, repeat-customer",
      "customer_note": "Please gift wrap",
      "shipping_address": "John Doe\nKerkstraat 12\n6211 AB Maastricht, NL",
      "line_items": [
        { "title": "Black Crew Socks (M)", "sku": "BCS-M-001", "quantity": 1 },
        { "title": "White Ankle Socks (L)", "sku": "WAS-L-002", "quantity": 2 }
      ]
    }
  ]
}
```

**`admin_users`** — whitelist of allowed admin emails
```json
{
  "email": "jeff@backbonecustomerservice.com",
  "added_at": "2026-01-15T09:00:00Z"
}
```

**`webhook_logs`** — recent webhook activity (auto-pruned to last 100)
```json
{
  "ticket_id": "98765",
  "store_name": "SolitSocks",
  "status": "success",
  "duration_ms": 1200,
  "orders_found": 3,
  "error": null,
  "timestamp": "2026-03-22T10:30:00Z"
}
```

### Cache Lifecycle

- Cache documents in `ticket_orders` are created on first webhook/lookup and updated on refresh
- **Cleanup:** A scheduled Cloud Run job (daily) deletes `ticket_orders` documents where `last_synced` is older than 90 days. Old tickets can always re-fetch via the sidebar Refresh button.
- If the same customer opens multiple tickets for the same store, each ticket gets its own cache entry. This is intentional — each ticket may have a different selected order.

## Shopify API Details

### API Version
Target **Shopify Admin REST API version `2025-01`**. Shopify deprecates API versions after ~12 months. The API version is configured as an environment variable so it can be updated without code changes.

### Required Scopes
Each connected store needs a **Shopify custom app** with the following access scopes:
- `read_orders` — access order data (includes fulfillments and tracking info)
- `read_customers` — look up customers by email

Note: `read_orders` covers fulfillment/tracking data (fulfillments are nested under orders). Product titles and SKUs are included in order line items, so `read_products` is not required.

Existing API keys may need scope adjustments.

### Rate Limiting
Shopify REST API allows ~2 requests/second per store (bucket-based: 40 requests, refills at 2/sec). Strategy:
- Each webhook processes one ticket = typically 1 Shopify API call. At normal ticket volumes, rate limits are not a concern.
- For burst scenarios (e.g., marketing email triggers many replies): the backend queues requests per store and processes them with a 500ms delay between calls.
- If a rate limit is hit (HTTP 429), the backend retries with exponential backoff (max 3 retries). If still failing, logs the error — the sidebar handles missing data gracefully via the Refresh button.

### Store Health Monitoring
- Each successful Shopify API call updates `last_successful_sync` on the store document
- Each failure updates `last_error` with the error message and timestamp
- Admin UI shows store health status: green (last sync < 24h), yellow (24-72h), red (> 72h or last call errored)
- Future enhancement: Slack notification when a store enters red status

## Out of Scope

- Phone support integration
- Real-time Shopify webhooks (push from Shopify on order changes) — future enhancement
- Per-store field mapping overrides — global config only
- Shopify app store listing — this is an internal tool, not a public app
- CRM integration
