jest.mock('../../src/services/zendeskClient');
jest.mock('../../src/services/storeService');
jest.mock('../../src/services/secretManager');
jest.mock('../../src/services/shopifyClient');
jest.mock('../../src/services/fieldMappingService');
jest.mock('../../src/services/orderCacheService');
jest.mock('../../src/config', () => ({
  shopifyApiVersion: '2025-01',
}));

const zendeskClient = require('../../src/services/zendeskClient');
const storeService = require('../../src/services/storeService');
const secretManager = require('../../src/services/secretManager');
const shopifyClient = require('../../src/services/shopifyClient');
const fieldMappingService = require('../../src/services/fieldMappingService');
const orderCacheService = require('../../src/services/orderCacheService');
const { lookupOrdersForTicket } = require('../../src/services/lookupService');

describe('lookupService', () => {
  afterEach(() => jest.clearAllMocks());

  const MOCK_ORDER = {
    shopify_order_id: '6001234567890',
    order_name: '#1052',
    financial_status: 'paid',
  };

  const MOCK_MAPPINGS = [
    { shopify_field: 'order_name', zendesk_field_id: '100', enabled: true },
  ];

  function setupHappyPath() {
    zendeskClient.getTicket.mockResolvedValue({
      ticketId: 98765,
      requesterId: 11111,
      storeName: 'SolitSocks',
    });
    zendeskClient.getUserEmails.mockResolvedValue(['john@example.com']);
    zendeskClient.updateTicketFields.mockResolvedValue();
    storeService.getStoreByName.mockResolvedValue({
      id: 'solitsocks',
      store_name: 'SolitSocks',
      shopify_domain: 'solitsocks.myshopify.com',
      secret_name: 'projects/p/secrets/s/versions/latest',
      is_active: true,
    });
    secretManager.getSecret.mockResolvedValue('shpat_test123');
    shopifyClient.getOrdersByEmail.mockResolvedValue([MOCK_ORDER]);
    fieldMappingService.getEnabledMappings.mockResolvedValue(MOCK_MAPPINGS);
    fieldMappingService.buildTicketFields.mockReturnValue([
      { id: '100', value: '#1052' },
    ]);
    orderCacheService.cacheOrders.mockResolvedValue();
  }

  test('happy path: looks up orders and updates ticket', async () => {
    setupHappyPath();

    const result = await lookupOrdersForTicket('98765');

    expect(storeService.getStoreByName).toHaveBeenCalledWith('SolitSocks');
    expect(secretManager.getSecret).toHaveBeenCalledWith(
      'projects/p/secrets/s/versions/latest'
    );
    expect(shopifyClient.getOrdersByEmail).toHaveBeenCalledWith({
      shopifyDomain: 'solitsocks.myshopify.com',
      apiToken: 'shpat_test123',
      apiVersion: '2025-01',
      email: 'john@example.com',
      storeId: 'solitsocks',
    });
    expect(orderCacheService.cacheOrders).toHaveBeenCalled();
    expect(zendeskClient.updateTicketFields).toHaveBeenCalledWith('98765', [
      { id: '100', value: '#1052' },
    ]);
    expect(result.ordersFound).toBe(1);
  });

  test('returns error when store not found', async () => {
    zendeskClient.getTicket.mockResolvedValue({
      ticketId: 98765,
      requesterId: 11111,
      storeName: 'Unknown',
    });
    storeService.getStoreByName.mockResolvedValue(null);

    const result = await lookupOrdersForTicket('98765');

    expect(result.error).toBe('store_not_found');
    expect(shopifyClient.getOrdersByEmail).not.toHaveBeenCalled();
  });

  test('returns error when store name field is empty', async () => {
    zendeskClient.getTicket.mockResolvedValue({
      ticketId: 98765,
      requesterId: 11111,
      storeName: null,
    });

    const result = await lookupOrdersForTicket('98765');
    expect(result.error).toBe('no_store_name');
  });
});
