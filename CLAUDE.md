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
# Deploy backend from source (builds Docker image via Cloud Build)
cd backend
gcloud run deploy zendesk-shopify-backend --source . --region europe-west4 --project=bcs-internal \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=bcs-internal,SHOPIFY_API_VERSION=2025-01,ZENDESK_SUBDOMAIN=backbonecustomerservice,ZENDESK_EMAIL=zendesk@backbonecustomerservice.com,ZENDESK_STORE_FIELD_ID=18240308793116" \
  --set-secrets "ZENDESK_API_TOKEN=zendesk-api-token:latest,ZENDESK_WEBHOOK_SECRET=zendesk-webhook-secret:latest,ZAF_SHARED_SECRET=zaf-shared-secret:latest,INTERNAL_API_KEY=internal-api-key:latest"
```

**Live URL:** `https://zendesk-shopify-backend-708001607351.europe-west4.run.app`

---

## Architecture

### Data Flow

1. **Webhook path:** Zendesk ticket created → trigger fires POST `/webhook/ticket-created` with `{"ticket_id": "..."}` (HMAC-verified) → backend reads ticket → extracts store name from dropdown field (tag format: `shop_name_<name>`) → looks up store in Firestore by tag → gets Shopify API token from Secret Manager → queries Shopify `/orders.json?email=` for all requester email identities (verified and unverified) → caches orders in Firestore `ticket_orders/` → updates Zendesk custom fields via REST API.

2. **Sidebar path:** Agent opens ticket → ZAF app loads → GET `/api/orders?ticketId=X` (ZAF JWT auth) → backend returns cached orders → sidebar renders order selector. Agent can switch order (POST `/api/select-order`) or force refresh (POST `/api/lookup`).

3. **Admin path:** Firebase Google login → JWT verified against `admin_users/` email whitelist → CRUD on `stores/`, `field_mappings/`, and read-only `webhook_logs/`.

### Firestore Collections

| Collection | Purpose |
|------------|---------|
| `stores/` | One doc per Shopify store; doc ID = Zendesk dropdown tag (e.g. `shop_name_chaps_herrenmode_de`); `secret_name` points to Secret Manager |
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

### Rate Limiting (Increment 4)

Shopify enforces 2 req/sec per store. The backend will use an **in-memory per-store queue** (`rateLimiter.js`) to serialize requests. Not yet implemented — planned for Increment 4.

---

## Key Design Decisions

- **Stateless Cloud Run:** All state lives in Firestore. Multiple Cloud Run instances are safe — no in-memory shared state except the rate limiter queue (acceptable because each instance queues independently at ≤2 req/s).
- **Sidebar uses `client.request()`** (ZAF proxy) for all backend calls — required for CORS in the Zendesk iframe context.
- **Admin UI is served from the backend** at `/admin` — single Cloud Run deploy covers both API and frontend.
- **Cache TTL:** `ticket_orders/` docs are cleaned up by a daily Cloud Scheduler job (02:00 CET) that deletes docs older than 30 days.
- **Shopify API version:** `2025-01` — pinned in `SHOPIFY_API_VERSION` env var.

---

## Implementation Status

1. **Increment 1: Backend API** — COMPLETE, deployed, verified end-to-end (2026-03-23)
2. **Increment 2: Zendesk Sidebar** — COMPLETE, deployed, verified end-to-end (2026-03-23). Branch: `increment-2-zendesk-sidebar`
3. **Increment 3: Admin Web UI** — COMPLETE, deployed, verified end-to-end (2026-03-23). Branch: `increment-3-admin-web-ui`
4. **Increment 4: Production Hardening** — COMPLETE, deployed, verified end-to-end (2026-03-23). Branch: `increment-4-production-hardening`

The architecture spec is at `docs/superpowers/specs/2026-03-22-zendesk-shopify-integration-design.md`.

## Important Conventions

- **Store field tags:** The Zendesk "Shop name" dropdown uses tags like `shop_name_chaps_herrenmode_de`. Firestore `stores/` doc IDs must match these tags exactly.
- **Email identities:** Include all Zendesk email identities (verified AND unverified) when looking up Shopify orders. Most inbound requesters are unverified.
- **Secrets:** Per-store Shopify tokens go in Secret Manager as `shopify-<store-name>`. Zendesk/ZAF secrets are `zendesk-api-token`, `zendesk-webhook-secret`, `zaf-shared-secret`.
