jest.mock('axios');
const axios = require('axios');
const { getOrdersByEmail } = require('../../src/services/shopifyClient');

const SHOPIFY_ORDER = {
  id: 6001234567890,
  name: '#1052',
  email: 'john@example.com',
  phone: '+31612345678',
  created_at: '2026-03-18T14:22:00+01:00',
  closed_at: null,
  cancelled_at: null,
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  total_price: '49.95',
  currency: 'EUR',
  tags: 'vip, repeat-customer',
  note: 'Please gift wrap',
  customer: {
    orders_count: 5,
    total_spent: '249.75',
  },
  discount_codes: [
    { code: 'SUMMER10', amount: '5.00', type: 'fixed_amount' },
  ],
  refunds: [
    {
      created_at: '2026-03-19T10:00:00+01:00',
      note: 'Wrong size',
      transactions: [{ amount: '49.95', kind: 'refund' }],
    },
  ],
  shipping_address: {
    first_name: 'John',
    last_name: 'Doe',
    address1: 'Kerkstraat 12',
    city: 'Maastricht',
    province: '',
    zip: '6211 AB',
    country: 'Netherlands',
    country_code: 'NL',
  },
  billing_address: {
    first_name: 'John',
    last_name: 'Doe',
    address1: 'Factuurstraat 1',
    city: 'Amsterdam',
    province: '',
    zip: '1011 AB',
    country: 'Netherlands',
    country_code: 'NL',
  },
  line_items: [
    { title: 'Black Crew Socks', variant_title: 'M', sku: 'BCS-M-001', quantity: 1, fulfillment_status: 'fulfilled' },
    { title: 'White Ankle Socks', variant_title: 'L', sku: 'WAS-L-002', quantity: 2, fulfillment_status: null },
  ],
  fulfillments: [
    {
      tracking_number: '3SXYZ123456',
      tracking_url: 'https://tracking.example.com/3SXYZ123456',
      tracking_company: 'DHL',
    },
  ],
  payment_gateway_names: ['shopify_payments'],
};

describe('shopifyClient', () => {
  afterEach(() => jest.clearAllMocks());

  test('fetches and normalizes orders', async () => {
    axios.get.mockResolvedValue({ data: { orders: [SHOPIFY_ORDER] } });

    const orders = await getOrdersByEmail({
      shopifyDomain: 'solitsocks.myshopify.com',
      apiToken: 'shpat_test123',
      apiVersion: '2025-01',
      email: 'john@example.com',
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://solitsocks.myshopify.com/admin/api/2025-01/orders.json',
      expect.objectContaining({
        params: { email: 'john@example.com', status: 'any', limit: 50 },
      })
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]).toEqual({
      shopify_order_id: '6001234567890',
      order_name: '#1052',
      order_status: 'open',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '49.95',
      currency: 'EUR',
      created_at: '2026-03-18T14:22:00+01:00',
      order_email: 'john@example.com',
      order_phone: '+31612345678',
      tracking_numbers: ['3SXYZ123456'],
      tracking_urls: ['https://tracking.example.com/3SXYZ123456'],
      tracking_companies: ['DHL'],
      payment_method: 'Shopify Payments',
      discount_codes: [
        { code: 'SUMMER10', amount: '5.00', type: 'fixed_amount' },
      ],
      refunds: [
        { amount: '49.95', reason: 'Wrong size', created_at: '2026-03-19T10:00:00+01:00' },
      ],
      tags: 'vip, repeat-customer',
      customer_note: 'Please gift wrap',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      billing_address: 'John Doe\nFactuurstraat 1\n1011 AB Amsterdam\nNetherlands',
      customer_orders_count: 5,
      customer_total_spent: '249.75',
      line_items: [
        { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1, fulfillment_status: 'fulfilled' },
        { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2, fulfillment_status: 'unfulfilled' },
      ],
    });
  });

  test('returns empty array when no orders found', async () => {
    axios.get.mockResolvedValue({ data: { orders: [] } });

    const orders = await getOrdersByEmail({
      shopifyDomain: 'test.myshopify.com',
      apiToken: 'token',
      apiVersion: '2025-01',
      email: 'nobody@example.com',
    });

    expect(orders).toEqual([]);
  });
});
