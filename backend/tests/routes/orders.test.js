const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/orderCacheService');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const orderCacheService = require('../../src/services/orderCacheService');
const createApp = require('../../src/app');

describe('GET /api/orders', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = jwt.sign({ sub: 'user1' }, 'test-zaf-secret', { expiresIn: '1h' });
  });

  afterEach(() => jest.clearAllMocks());

  test('returns cached orders for a ticket', async () => {
    const cachedData = {
      ticket_id: '123',
      store_name: 'SolitSocks',
      orders: [{ order_name: '#1052' }],
    };
    orderCacheService.getCachedOrders.mockResolvedValue(cachedData);

    const res = await request(app)
      .get('/api/orders?ticketId=123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedData);
  });

  test('returns 404 when no cached data', async () => {
    orderCacheService.getCachedOrders.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/orders?ticketId=999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('returns 400 when ticketId missing', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/orders?ticketId=123');
    expect(res.status).toBe(401);
  });
});
