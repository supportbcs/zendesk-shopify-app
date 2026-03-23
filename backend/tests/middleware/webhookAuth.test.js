const crypto = require('crypto');

jest.mock('../../src/config', () => ({
  zendeskWebhookSecret: 'test-webhook-secret',
}));

const { verifyWebhookSignature } = require('../../src/middleware/webhookAuth');

function makeReq(body, secret) {
  const bodyStr = JSON.stringify(body);
  const timestamp = '2026-03-22T10:00:00Z';
  const signBody = timestamp + bodyStr;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signBody)
    .digest('base64');

  return {
    headers: {
      'x-zendesk-webhook-signature': signature,
      'x-zendesk-webhook-signature-timestamp': timestamp,
    },
    body,
    rawBody: Buffer.from(bodyStr),
  };
}

describe('webhookAuth', () => {
  test('allows valid signature', () => {
    const req = makeReq({ ticket_id: '123' }, 'test-webhook-secret');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyWebhookSignature(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects invalid signature', () => {
    const req = makeReq({ ticket_id: '123' }, 'wrong-secret');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyWebhookSignature(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
