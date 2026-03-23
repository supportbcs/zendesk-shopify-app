const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/orderCacheService');
jest.mock('../../src/services/fieldMappingService');
jest.mock('../../src/services/zendeskClient');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const orderCacheService = require('../../src/services/orderCacheService');
const fieldMappingService = require('../../src/services/fieldMappingService');
const zendeskClient = require('../../src/services/zendeskClient');
const createApp = require('../../src/app');

describe('POST /api/select-order', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = jwt.sign({ sub: 'user1' }, 'test-zaf-secret', { expiresIn: '1h' });
  });

  afterEach(() => jest.clearAllMocks());

  test('selects order from cache and updates Zendesk', async () => {
    const cachedData = {
      orders: [
        { shopify_order_id: '111', order_name: '#1', financial_status: 'paid' },
        { shopify_order_id: '222', order_name: '#2', financial_status: 'refunded' },
      ],
    };
    orderCacheService.getCachedOrders.mockResolvedValue(cachedData);
    orderCacheService.updateSelectedOrder.mockResolvedValue();
    fieldMappingService.getEnabledMappings.mockResolvedValue([
      { shopify_field: 'order_name', zendesk_field_id: '100', enabled: true },
    ]);
    fieldMappingService.buildTicketFields.mockReturnValue([
      { id: '100', value: '#2' },
    ]);
    zendeskClient.updateTicketFields.mockResolvedValue();

    const res = await request(app)
      .post('/api/select-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketId: '123', orderId: '222' });

    expect(res.status).toBe(200);
    expect(orderCacheService.updateSelectedOrder).toHaveBeenCalledWith('123', '222');
    expect(zendeskClient.updateTicketFields).toHaveBeenCalled();
  });

  test('returns 404 when order not in cache', async () => {
    orderCacheService.getCachedOrders.mockResolvedValue({
      orders: [{ shopify_order_id: '111' }],
    });

    const res = await request(app)
      .post('/api/select-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketId: '123', orderId: '999' });

    expect(res.status).toBe(404);
  });

  test('returns 400 when params missing', async () => {
    const res = await request(app)
      .post('/api/select-order')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
