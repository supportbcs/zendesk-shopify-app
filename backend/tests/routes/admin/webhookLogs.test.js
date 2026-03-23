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

describe('Admin Webhook Logs API', () => {
  let app;

  beforeAll(() => { app = createApp(); });
  afterEach(() => jest.clearAllMocks());

  test('GET /api/admin/webhook-logs returns recent logs', async () => {
    const mockDocs = [
      {
        id: 'log1',
        data: () => ({
          ticket_id: '123', store_name: 'SolitSocks',
          status: 'success', duration_ms: 1200,
          orders_found: 3, error: null,
          timestamp: '2026-03-22T10:30:00Z',
        }),
      },
    ];
    firestore.collection = jest.fn().mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: mockDocs }),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/admin/webhook-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].status).toBe('success');
  });
});
