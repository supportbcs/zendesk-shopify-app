jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const {
  getCachedOrders,
  cacheOrders,
} = require('../../src/services/orderCacheService');

describe('orderCacheService', () => {
  afterEach(() => jest.clearAllMocks());

  const mockSet = jest.fn().mockResolvedValue();
  const mockGet = jest.fn();

  beforeEach(() => {
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: mockGet,
        set: mockSet,
      }),
    });
  });

  test('getCachedOrders returns data when cached', async () => {
    const cachedData = {
      ticket_id: '98765',
      store_name: 'SolitSocks',
      selected_order_id: '6001234567890',
      orders: [{ shopify_order_id: '6001234567890', order_name: '#1052' }],
    };
    mockGet.mockResolvedValue({ exists: true, data: () => cachedData });

    const result = await getCachedOrders('98765');
    expect(result).toEqual(cachedData);
  });

  test('getCachedOrders returns null when not cached', async () => {
    mockGet.mockResolvedValue({ exists: false });

    const result = await getCachedOrders('99999');
    expect(result).toBeNull();
  });

  test('cacheOrders writes correct document', async () => {
    const orders = [{ shopify_order_id: '123', order_name: '#1' }];

    await cacheOrders({
      ticketId: '98765',
      storeName: 'SolitSocks',
      customerEmails: ['john@example.com'],
      orders,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: '98765',
        store_name: 'SolitSocks',
        customer_emails: ['john@example.com'],
        selected_order_id: '123',
        orders,
      }),
      { merge: true }
    );
  });
});
