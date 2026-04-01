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
    customer_first_name: 'John',
    customer_last_name: 'Doe',
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
    zendeskClient.getUser.mockResolvedValue({
      name: 'john',
      email: 'john@example.com',
    });
    zendeskClient.updateUser.mockResolvedValue();
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

  test('updates requester name when auto-derived from email', async () => {
    setupHappyPath();
    zendeskClient.getUser.mockResolvedValue({
      name: 'Yarek1331',
      email: 'yarek1331@gmail.com',
    });

    const result = await lookupOrdersForTicket('98765');

    expect(zendeskClient.updateUser).toHaveBeenCalledWith(11111, {
      name: 'John Doe',
    });
    expect(result.requesterUpdated).toBe('Yarek1331 -> John Doe');
  });

  test('updates requester name when capitalization is wrong', async () => {
    setupHappyPath();
    zendeskClient.getUser.mockResolvedValue({
      name: 'john doe',
      email: 'john.doe@gmail.com',
    });

    const result = await lookupOrdersForTicket('98765');

    expect(zendeskClient.updateUser).toHaveBeenCalledWith(11111, {
      name: 'John Doe',
    });
    expect(result.requesterUpdated).toBe('john doe -> John Doe');
  });

  test('updates requester name when first name is just an initial', async () => {
    setupHappyPath();
    zendeskClient.getUser.mockResolvedValue({
      name: 'G Neale-RSG',
      email: 'g.neale@example.com',
    });

    const result = await lookupOrdersForTicket('98765');

    expect(zendeskClient.updateUser).toHaveBeenCalledWith(11111, {
      name: 'John Doe',
    });
    expect(result.requesterUpdated).toBe('G Neale-RSG -> John Doe');
  });

  test('does not update requester name when already correct', async () => {
    setupHappyPath();
    zendeskClient.getUser.mockResolvedValue({
      name: 'John Doe',
      email: 'john.doe@gmail.com',
    });

    const result = await lookupOrdersForTicket('98765');

    expect(zendeskClient.updateUser).not.toHaveBeenCalled();
    expect(result.requesterUpdated).toBeUndefined();
  });

  test('does not update when Shopify has no customer name', async () => {
    setupHappyPath();
    shopifyClient.getOrdersByEmail.mockResolvedValue([{
      ...MOCK_ORDER,
      customer_first_name: '',
      customer_last_name: '',
    }]);
    zendeskClient.getUser.mockResolvedValue({
      name: 'yarek1331',
      email: 'yarek1331@gmail.com',
    });

    const result = await lookupOrdersForTicket('98765');

    expect(zendeskClient.updateUser).not.toHaveBeenCalled();
    expect(result.requesterUpdated).toBeUndefined();
  });

  test('does not update when no orders found', async () => {
    setupHappyPath();
    shopifyClient.getOrdersByEmail.mockResolvedValue([]);
    zendeskClient.getUser.mockResolvedValue({
      name: 'yarek1331',
      email: 'yarek1331@gmail.com',
    });

    const result = await lookupOrdersForTicket('98765');

    expect(zendeskClient.updateUser).not.toHaveBeenCalled();
  });
});
