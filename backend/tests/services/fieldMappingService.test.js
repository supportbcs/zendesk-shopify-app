jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const {
  getEnabledMappings,
  buildTicketFields,
} = require('../../src/services/fieldMappingService');

const MOCK_MAPPINGS = {
  mappings: [
    { shopify_field: 'order_name', zendesk_field_id: '100', label: 'Order ID', enabled: true },
    { shopify_field: 'financial_status', zendesk_field_id: '101', label: 'Financial Status', enabled: true },
    { shopify_field: 'total_price', zendesk_field_id: '102', label: 'Order Total', enabled: false },
  ],
};

const MOCK_ORDER = {
  shopify_order_id: '6001234567890',
  order_name: '#1052',
  order_status: 'open',
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  total_price: '49.95',
  currency: 'EUR',
  created_at: '2026-03-18T14:22:00+01:00',
  tracking_numbers: ['3SXYZ123456'],
  tracking_urls: ['https://tracking.example.com/3SXYZ123456'],
  payment_method: 'Shopify Payments',
  tags: 'vip',
  customer_note: '',
  shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
  line_items: [
    { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1 },
    { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2 },
  ],
};

describe('fieldMappingService', () => {
  afterEach(() => jest.clearAllMocks());

  test('getEnabledMappings returns only enabled mappings', async () => {
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => MOCK_MAPPINGS,
        }),
      }),
    });

    const mappings = await getEnabledMappings();
    expect(mappings).toHaveLength(2);
    expect(mappings.every(m => m.enabled)).toBe(true);
  });

  test('buildTicketFields maps order data to Zendesk field IDs', () => {
    const mappings = MOCK_MAPPINGS.mappings.filter(m => m.enabled);
    const fields = buildTicketFields(MOCK_ORDER, mappings);

    expect(fields).toEqual([
      { id: '100', value: '#1052' },
      { id: '101', value: 'paid' },
    ]);
  });

  test('buildTicketFields handles line items', () => {
    const mappings = [
      { shopify_field: 'line_item_1_title', zendesk_field_id: '200', enabled: true },
      { shopify_field: 'line_item_1_sku', zendesk_field_id: '201', enabled: true },
      { shopify_field: 'line_item_1_quantity', zendesk_field_id: '202', enabled: true },
      { shopify_field: 'line_item_2_title', zendesk_field_id: '203', enabled: true },
    ];

    const fields = buildTicketFields(MOCK_ORDER, mappings);
    expect(fields).toEqual([
      { id: '200', value: 'Black Crew Socks (M)' },
      { id: '201', value: 'BCS-M-001' },
      { id: '202', value: '1' },
      { id: '203', value: 'White Ankle Socks (L)' },
    ]);
  });
});
