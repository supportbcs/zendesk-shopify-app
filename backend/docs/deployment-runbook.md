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
| `GCP_PROJECT_ID` | GCP project ID | `bcs-internal` |
| `SHOPIFY_API_VERSION` | Shopify API version | `2025-01` |
| `ZENDESK_SUBDOMAIN` | Zendesk subdomain | `backbonecustomerservice` |
| `ZENDESK_EMAIL` | Zendesk API user email | `zendesk@backbonecustomerservice.com` |
| `ZENDESK_API_TOKEN` | Zendesk API token (via Secret Manager) | — |
| `ZENDESK_WEBHOOK_SECRET` | Zendesk webhook signing secret (via Secret Manager) | — |
| `ZENDESK_STORE_FIELD_ID` | Zendesk custom field ID for store name | `18240308793116` |
| `ZAF_SHARED_SECRET` | ZAF shared secret for sidebar auth (via Secret Manager) | — |

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
  --region europe-west4 \
  --project=bcs-internal \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=bcs-internal,SHOPIFY_API_VERSION=2025-01,ZENDESK_SUBDOMAIN=backbonecustomerservice,ZENDESK_EMAIL=zendesk@backbonecustomerservice.com,ZENDESK_STORE_FIELD_ID=18240308793116" \
  --set-secrets "ZENDESK_API_TOKEN=zendesk-api-token:latest,ZENDESK_WEBHOOK_SECRET=zendesk-webhook-secret:latest,ZAF_SHARED_SECRET=zaf-shared-secret:latest"
```

## Deploy Zendesk Sidebar App

```bash
cd sidebar
zcli apps:package
# Upload the resulting .zip in Zendesk Admin Center → Apps → Upload private app
```

Configure app settings:
- **Backend URL**: Cloud Run service URL (e.g., `https://zendesk-shopify-backend-708001607351.europe-west4.run.app`)
- **Shared Secret**: Same value as `ZAF_SHARED_SECRET`

## Set Up Cache Cleanup Job

```bash
# Create a Cloud Run job for cache cleanup
gcloud run jobs create cache-cleanup \
  --source . \
  --region europe-west4 \
  --project=bcs-internal \
  --command "node" \
  --args "src/jobs/cacheCleanup.js" \
  --set-env-vars "GCP_PROJECT_ID=bcs-internal"

# Schedule it to run daily at 3:00 AM CET
gcloud scheduler jobs create http cache-cleanup-daily \
  --location europe-west4 \
  --schedule "0 3 * * *" \
  --time-zone "Europe/Amsterdam" \
  --uri "https://europe-west4-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/bcs-internal/jobs/cache-cleanup:run" \
  --http-method POST \
  --oauth-service-account-email "bcs-internal@appspot.gserviceaccount.com"
```

## Seed Initial Data

### Admin users (Firestore)

Collection: `admin_users`, Document ID: email address

```json
{
  "email": "support@backbonecustomerservice.com",
  "added_at": "2026-03-23T10:00:00Z"
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
curl https://zendesk-shopify-backend-708001607351.europe-west4.run.app/health
# Expected: {"status":"ok"}
```

### Logs
```bash
# View recent logs
gcloud run services logs read zendesk-shopify-backend --region europe-west4 --project=bcs-internal --limit 100

# Filter for errors
gcloud run services logs read zendesk-shopify-backend --region europe-west4 --project=bcs-internal --limit 50 | grep ERROR
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
     --region europe-west4 \
     --project=bcs-internal \
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
