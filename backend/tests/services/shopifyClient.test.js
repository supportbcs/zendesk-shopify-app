jest.mock('axios');
const axios = require('axios');
const { getOrdersByEmail } = require('../../src/services/shopifyClient');

const SHOPIFY_ORDER = {
  id: 6001234567890,
  name: '#1052',
  email: 'john@example.com',
  created_at: '2026-03-18T14:22:00+01:00',
  closed_at: null,
  cancelled_at: null,
  financial_status: 'paid',
  fulfillment_status: 'fulfilled',
  total_price: '49.95',
  currency: 'EUR',
  tags: 'vip, repeat-customer',
  note: 'Please gift wrap',
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
  line_items: [
    { title: 'Black Crew Socks', variant_title: 'M', sku: 'BCS-M-001', quantity: 1 },
    { title: 'White Ankle Socks', variant_title: 'L', sku: 'WAS-L-002', quantity: 2 },
  ],
  fulfillments: [
    {
      tracking_number: '3SXYZ123456',
      tracking_url: 'https://tracking.example.com/3SXYZ123456',
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
      tracking_numbers: ['3SXYZ123456'],
      tracking_urls: ['https://tracking.example.com/3SXYZ123456'],
      payment_method: 'Shopify Payments',
      tags: 'vip, repeat-customer',
      customer_note: 'Please gift wrap',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      line_items: [
        { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1 },
        { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2 },
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
