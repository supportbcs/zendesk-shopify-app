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

const REQUIRED = [
  'GCP_PROJECT_ID',
  'ZENDESK_SUBDOMAIN',
  'ZENDESK_EMAIL',
  'ZENDESK_API_TOKEN',
  'ZENDESK_WEBHOOK_SECRET',
  'ZENDESK_STORE_FIELD_ID',
  'ZAF_SHARED_SECRET',
];

function validateConfig() {
  const missing = REQUIRED.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

module.exports = config;
module.exports.validateConfig = validateConfig;
