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
