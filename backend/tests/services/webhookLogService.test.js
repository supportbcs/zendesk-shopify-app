jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { logWebhookCall } = require('../../src/services/webhookLogService');

describe('webhookLogService', () => {
  afterEach(() => jest.clearAllMocks());

  test('writes log entry to Firestore', async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: 'log1' });
    const mockGet = jest.fn().mockResolvedValue({ size: 50, docs: [] });

    firestore.collection = jest.fn().mockReturnValue({
      add: mockAdd,
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: mockGet,
        }),
      }),
      count: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: () => ({ count: 50 }) }),
      }),
    });

    await logWebhookCall({
      ticketId: '123',
      storeName: 'SolitSocks',
      status: 'success',
      durationMs: 1200,
      ordersFound: 3,
      error: null,
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '123',
        store_name: 'SolitSocks',
        status: 'success',
        duration_ms: 1200,
        orders_found: 3,
        error: null,
      })
    );
  });
});
