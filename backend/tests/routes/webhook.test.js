const crypto = require('crypto');
const request = require('supertest');

jest.mock('../../src/services/lookupService');
jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
}));

const lookupService = require('../../src/services/lookupService');
const createApp = require('../../src/app');

describe('POST /webhook/ticket-created', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  function signedRequest(body) {
    const bodyStr = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const signature = crypto
      .createHmac('sha256', 'test-secret')
      .update(timestamp + bodyStr)
      .digest('base64');

    return request(app)
      .post('/webhook/ticket-created')
      .set('Content-Type', 'application/json')
      .set('x-zendesk-webhook-signature', signature)
      .set('x-zendesk-webhook-signature-timestamp', timestamp)
      .send(body);
  }

  test('triggers lookup and returns 200', async () => {
    lookupService.lookupOrdersForTicket.mockResolvedValue({
      ticketId: '123',
      ordersFound: 2,
    });

    const res = await signedRequest({ ticket_id: '123' });

    expect(res.status).toBe(200);
    expect(lookupService.lookupOrdersForTicket).toHaveBeenCalledWith('123');
  });

  test('returns 400 when ticket_id missing', async () => {
    const res = await signedRequest({});

    expect(res.status).toBe(400);
  });

  test('returns 401 without valid signature', async () => {
    const res = await request(app)
      .post('/webhook/ticket-created')
      .send({ ticket_id: '123' });

    expect(res.status).toBe(401);
  });
});
