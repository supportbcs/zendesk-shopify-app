const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn().mockResolvedValue({
    uid: 'admin1', email: 'jeff@backbonecustomerservice.com',
    email_verified: true, name: 'Jeff',
  });
  return { auth: () => ({ verifyIdToken }), __verifyIdToken: verifyIdToken };
});
jest.mock('../../../src/services/adminUserService', () => ({
  isEmailAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/firestore');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const firestore = require('../../../src/firestore');
const createApp = require('../../../src/app');

describe('Admin Field Mappings API', () => {
  let app;

  beforeAll(() => { app = createApp(); });
  afterEach(() => jest.clearAllMocks());

  test('GET /api/admin/field-mappings returns mappings', async () => {
    const mockData = {
      mappings: [
        { shopify_field: 'order_name', zendesk_field_id: '100', label: 'Order ID', enabled: true },
      ],
    };
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => mockData }),
      }),
    });

    const res = await request(app)
      .get('/api/admin/field-mappings')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.mappings).toHaveLength(1);
  });

  test('PUT /api/admin/field-mappings updates mappings', async () => {
    const mockSet = jest.fn().mockResolvedValue();
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({ set: mockSet }),
    });

    const newMappings = {
      mappings: [
        { shopify_field: 'order_name', zendesk_field_id: '100', label: 'Order ID', enabled: true },
        { shopify_field: 'financial_status', zendesk_field_id: '101', label: 'Financial Status', enabled: false },
      ],
    };

    const res = await request(app)
      .put('/api/admin/field-mappings')
      .set('Authorization', 'Bearer valid-token')
      .send(newMappings);

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(newMappings);
  });
});
