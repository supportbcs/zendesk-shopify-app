describe('config validation', () => {
  const REQUIRED_VARS = {
    GCP_PROJECT_ID: 'test-project',
    ZENDESK_SUBDOMAIN: 'test-subdomain',
    ZENDESK_EMAIL: 'test@example.com',
    ZENDESK_API_TOKEN: 'test-token',
    ZENDESK_WEBHOOK_SECRET: 'test-secret',
    ZENDESK_STORE_FIELD_ID: '12345',
    ZAF_SHARED_SECRET: 'test-zaf-secret',
  };

  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Set all required vars
    Object.assign(process.env, REQUIRED_VARS);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('validateConfig passes when all required vars are set', () => {
    const { validateConfig } = require('../src/config');
    expect(() => validateConfig()).not.toThrow();
  });

  test('validateConfig throws when GCP_PROJECT_ID is missing', () => {
    delete process.env.GCP_PROJECT_ID;
    const { validateConfig } = require('../src/config');
    expect(() => validateConfig()).toThrow('GCP_PROJECT_ID');
  });

  test('validateConfig throws listing all missing vars', () => {
    delete process.env.GCP_PROJECT_ID;
    delete process.env.ZENDESK_SUBDOMAIN;
    const { validateConfig } = require('../src/config');
    expect(() => validateConfig()).toThrow('GCP_PROJECT_ID');
    expect(() => validateConfig()).toThrow('ZENDESK_SUBDOMAIN');
  });

  test('SHOPIFY_API_VERSION defaults to 2025-01', () => {
    const cfg = require('../src/config');
    expect(cfg.shopifyApiVersion).toBe('2025-01');
  });
});
