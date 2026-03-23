const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/lookupService');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const lookupService = require('../../src/services/lookupService');
const createApp = require('../../src/app');

describe('POST /api/lookup', () => {
  let app;
  let token;

  beforeAll(() => {
    app = createApp();
    token = jwt.sign({ sub: 'user1' }, 'test-zaf-secret', { expiresIn: '1h' });
  });

  afterEach(() => jest.clearAllMocks());

  test('triggers lookup and returns result', async () => {
    lookupService.lookupOrdersForTicket.mockResolvedValue({
      ticketId: '123',
      ordersFound: 3,
    });

    const res = await request(app)
      .post('/api/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketId: '123' });

    expect(res.status).toBe(200);
    expect(lookupService.lookupOrdersForTicket).toHaveBeenCalledWith('123');
    expect(res.body.ordersFound).toBe(3);
  });

  test('returns 400 when ticketId missing', async () => {
    const res = await request(app)
      .post('/api/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
