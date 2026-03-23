# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Zendesk–Shopify integration platform built to replace ChannelReply for Backbone Customer Service. When a Zendesk ticket is created, it automatically fetches the customer's Shopify orders and populates ticket fields — no manual lookup required.

Three deployable components:
- **`backend/`** — Node.js/Express API on Google Cloud Run
- **`sidebar/`** — Zendesk ZAF iframe app (vanilla JS + esbuild)
- **`admin/`** — React/Vite admin UI (served by the backend)

Implementation plans and specs live in `docs/superpowers/`.

---

## Commands

### Backend
```bash
cd backend
npm install
npm start          # node src/index.js (port 8080)
npm test           # jest --verbose
npm run test:watch # jest --watch
```

### Sidebar
```bash
cd sidebar
npm install
npx esbuild src/index.js --bundle --outfile=assets/main.js   # build
zcli push                                                     # deploy to Zendesk
npm test
```

### Admin UI
```bash
cd admin
npm install
npm run dev        # Vite dev server
npm run build      # outputs to dist/ (served by backend)
npm test
```

### Deployment
```bash
# Deploy backend + admin (admin/dist served statically)
gcloud run deploy zendesk-shopify-backend --source backend/ --platform managed --region europe-west4

# Required env vars on Cloud Run:
# PORT, GCP_PROJECT_ID, SHOPIFY_API_VERSION, ZENDESK_SUBDOMAIN,
# ZENDESK_EMAIL, ZENDESK_API_TOKEN, ZENDESK_WEBHOOK_SECRET,
# ZENDESK_STORE_FIELD_ID, ZAF_SHARED_SECRET, FIREBASE_PROJECT_ID
```

---

## Architecture

### Data Flow

1. **Webhook path:** Zendesk ticket created → POST `/webhook/ticket-created` (HMAC-verified) → backend reads ticket email → fans out to all active stores → Shopify Admin API `/orders.json?email=` → results cached in Firestore `ticket_orders/` → Zendesk custom fields updated via REST API.

2. **Sidebar path:** Agent opens ticket → ZAF app loads → GET `/api/orders?ticketId=X` (ZAF JWT auth) → backend returns cached orders → sidebar renders order selector. Agent can switch order (POST `/api/select-order`) or force refresh (POST `/api/lookup`).

3. **Admin path:** Firebase Google login → JWT verified against `admin_users/` email whitelist → CRUD on `stores/`, `field_mappings/`, and read-only `webhook_logs/`.

### Firestore Collections

| Collection | Purpose |
|------------|---------|
| `stores/` | One doc per Shopify store; `secret_name` points to Secret Manager |
| `field_mappings/` | Single `global` doc with array of Zendesk field → Shopify field mappings |
| `ticket_orders/` | Per-ticket cache of matched orders + selected order ID |
| `admin_users/` | Email whitelist for admin UI |
| `webhook_logs/` | Rolling 100-entry log of webhook activity |

### Authentication Layers

| Surface | Mechanism |
|---------|-----------|
| Webhook endpoint | Zendesk HMAC signing secret (`ZENDESK_WEBHOOK_SECRET`) |
| Sidebar endpoints (`/api/*`) | ZAF JWT signed with `ZAF_SHARED_SECRET` |
| Admin endpoints (`/api/admin/*`) | Firebase ID token + email whitelist check |

### Secret Management

Per-store Shopify API tokens are stored in **GCP Secret Manager**, not in Firestore. Each store doc has a `secret_name` field referencing its secret. The backend fetches secrets at runtime via the Secret Manager client — never hardcoded or logged.

### Rate Limiting

Shopify enforces 2 req/sec per store. The backend uses an **in-memory per-store queue** (`rateLimiter.js`) to serialize requests. On webhook receipt for a ticket with multiple stores, requests are queued store-by-store.

---

## Key Design Decisions

- **Stateless Cloud Run:** All state lives in Firestore. Multiple Cloud Run instances are safe — no in-memory shared state except the rate limiter queue (acceptable because each instance queues independently at ≤2 req/s).
- **Sidebar uses `client.request()`** (ZAF proxy) for all backend calls — required for CORS in the Zendesk iframe context.
- **Admin UI is served from the backend** at `/admin` — single Cloud Run deploy covers both API and frontend.
- **Cache TTL:** `ticket_orders/` docs are cleaned up by a daily Cloud Scheduler job (02:00 CET) that deletes docs older than 30 days.
- **Shopify API version:** `2025-01` — pinned in `SHOPIFY_API_VERSION` env var.

---

## Implementation Status

**All four increments are in detailed planning docs** — no source code exists yet. Start with the plans in order:

1. `docs/superpowers/plans/increment-1-backend-api.md` — Cloud Run backend + Firestore
2. `docs/superpowers/plans/increment-2-zendesk-sidebar.md` — ZAF sidebar app
3. `docs/superpowers/plans/increment-3-admin-web-ui.md` — React admin UI + admin API routes
4. `docs/superpowers/plans/increment-4-production-hardening.md` — Rate limiting, cleanup, logging, health monitoring

The architecture spec is at `docs/superpowers/specs/2026-03-22-zendesk-shopify-integration-design.md`.
