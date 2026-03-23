const { buildRequest, getOrders, triggerLookup, selectOrder } = require('../src/api');

describe('api', () => {
  describe('buildRequest', () => {
    test('builds GET request with JWT config', () => {
      const req = buildRequest('/api/orders?ticketId=123');

      expect(req.url).toBe('{{setting.backendUrl}}/api/orders?ticketId=123');
      expect(req.type).toBe('GET');
      expect(req.headers.Authorization).toBe('Bearer {{jwt.token}}');
      expect(req.jwt.algorithm).toBe('HS256');
      expect(req.jwt.secret_key).toBe('{{setting.shared_secret}}');
      expect(req.secure).toBe(true);
    });

    test('builds POST request with body', () => {
      const req = buildRequest('/api/lookup', {
        method: 'POST',
        body: { ticketId: '123' },
      });

      expect(req.type).toBe('POST');
      expect(req.data).toBe('{"ticketId":"123"}');
      expect(req.contentType).toBe('application/json');
    });
  });

  describe('getOrders', () => {
    test('calls client.request with correct path', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({ orders: [] }),
      };

      await getOrders(mockClient, '456');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '{{setting.backendUrl}}/api/orders?ticketId=456',
          type: 'GET',
        })
      );
    });
  });

  describe('triggerLookup', () => {
    test('calls client.request with POST and ticketId', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({ ordersFound: 3 }),
      };

      await triggerLookup(mockClient, '789');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '{{setting.backendUrl}}/api/lookup',
          type: 'POST',
          data: '{"ticketId":"789"}',
        })
      );
    });
  });

  describe('selectOrder', () => {
    test('calls client.request with ticketId and orderId', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({ status: 'ok' }),
      };

      await selectOrder(mockClient, '123', '6001234567890');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '{{setting.backendUrl}}/api/select-order',
          type: 'POST',
          data: '{"ticketId":"123","orderId":"6001234567890"}',
        })
      );
    });
  });
});
