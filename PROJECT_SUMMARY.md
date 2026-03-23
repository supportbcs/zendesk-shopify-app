# Zendesk-Shopify Integration — Project Summary

## Project Status: COMPLETE (2026-03-23)

All 4 increments built, tested (72 tests), deployed to Cloud Run, and merged to `main`.

**GitHub:** supportbcs/zendesk-shopify-app
**Cloud Run URL:** `https://zendesk-shopify-backend-708001607351.europe-west4.run.app`
**Admin UI:** `https://zendesk-shopify-backend-708001607351.europe-west4.run.app/admin`
**GCP Project:** bcs-internal
**Region:** europe-west4
**Latest revision:** 00012-bnp

---

## What Was Built

### Increment 1: Backend API
- Express API on Cloud Run with 4 endpoints
- Webhook: Zendesk ticket created → fetch Shopify orders → cache in Firestore → update Zendesk fields
- Sidebar endpoints: GET /api/orders, POST /api/lookup, POST /api/select-order
- Auth: HMAC for webhooks, ZAF JWT for sidebar
- Shopify order normalizer: 25+ fields including tracking, refunds, line items, addresses

### Increment 2: Zendesk Sidebar
- ZAF iframe app (vanilla JS + esbuild)
- Order display with selector for multiple orders
- Refresh button for live Shopify lookup
- "Open in Shopify" link
- Polling for webhook-created data with fallback to live lookup
- Deployed via `zcli push`; zip at `sidebar/tmp/shopify-order-data.zip`

### Increment 3: Admin Web UI
- React/Vite app served by Express at `/admin`
- Firebase Auth (Google sign-in) + email whitelist via `admin_users` Firestore collection
- Pages: Stores (CRUD + test connection), Field Mappings (toggle + Zendesk field IDs), Webhook Logs (stats + table)
- Multi-stage Dockerfile: Stage 1 builds React, Stage 2 runs Express + serves static
- Firebase config hardcoded as fallbacks in `admin/src/firebase.js` (public client-side values)
- Admin users: support@backbonecustomerservice.com, dylan@backbonecustomerservice.com

### Increment 4: Production Hardening
- Structured JSON logger (Cloud Run auto-picks up JSON stdout)
- Config validation — fail-fast on missing env vars at startup
- Per-store rate limiter — in-memory queue, 500ms delay, exponential backoff on 429
- Store health service — updates `last_successful_sync` / `last_error` on store docs
- Cache cleanup service + Cloud Run job entry point (daily at 3:00 AM CET)
- Replaced all console.log/warn/error with structured logger
- Deployment runbook at `backend/docs/deployment-runbook.md`

---

## Infrastructure

### Firestore Collections
| Collection | Docs | Purpose |
|------------|------|---------|
| `stores/` | 56 | One per Shopify store, doc ID = Zendesk dropdown tag |
| `field_mappings/` | 1 | `global` doc with 27 field mappings (all enabled) |
| `ticket_orders/` | Dynamic | Per-ticket cache of matched orders |
| `admin_users/` | 2 | Email whitelist for admin UI |
| `webhook_logs/` | Rolling 100 | Webhook activity log |

### Secret Manager
- `zendesk-api-token` — Zendesk API token
- `zendesk-webhook-secret` — Webhook HMAC signing secret
- `zaf-shared-secret` — ZAF JWT signing secret
- `shopify-shop_name_*` — 56 per-store Shopify API tokens

### Cloud Run Job
- **Job:** `cache-cleanup` — deletes ticket_orders docs older than 90 days
- **Scheduler:** `cache-cleanup-daily` — runs daily at 3:00 AM Amsterdam time (europe-west1 scheduler location)

### Zendesk Custom Fields (27 fields, all "- BCS" suffix)
Created for: Order ID, Order Status, Financial Status, Fulfillment Status, Order Total, Order Date, Tracking Numbers, Tracking URLs, Payment Method, Order Tags, Shipping Address, Customer Note, Product 1-5 Title/SKU/Qty

### Firebase
- Project: `bcs-internal`
- Google sign-in enabled
- Cloud Run domain added to authorized domains

---

## Stores (56 total)
All stores loaded from two CSV batches. Each store has:
- Firestore doc in `stores/` with doc ID matching Zendesk dropdown tag
- Shopify API token in Secret Manager as `shopify-{tag}`
- Mapped to Zendesk "Shop name" dropdown field (ID: 18240308793116)

---

## Git History
All branches merged to `main` and pushed to GitHub:
- `increment-1-backend-api` → merged
- `increment-2-zendesk-sidebar` → merged
- `increment-3-admin-web-ui` → merged
- `increment-4-production-hardening` → merged

---

## Key Decisions & Lessons
- **All Zendesk email identities** (verified AND unverified) must be included when looking up Shopify orders — most inbound requesters are unverified
- **ZAF template variables** (`{{setting.X}}`) only work in headers/jwt config, NOT in the URL field — use `client.metadata()` for URL values
- **Firebase config** values (apiKey, authDomain, projectId) are public client-side identifiers, safe to hardcode as fallbacks in the React app for Docker builds where `.env` isn't available
- **Express 5** requires named wildcards (`/admin/*splat`) instead of bare `*`
- **ChannelReply fields** kept alongside new "- BCS" fields — can remove ChannelReply fields once migration is complete
