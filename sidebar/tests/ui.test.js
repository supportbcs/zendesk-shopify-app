const {
  escapeHtml,
  formatDate,
  formatTimeAgo,
  renderLoading,
  renderError,
  renderNoOrders,
  renderStoreNotConfigured,
  renderOrderSelector,
  renderOrderData,
} = require('../src/ui');

describe('ui utilities', () => {
  describe('escapeHtml', () => {
    test('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    test('returns empty string for null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
      expect(escapeHtml(42)).toBe('42');
    });
  });

  describe('formatDate', () => {
    test('formats ISO date string', () => {
      var result = formatDate('2026-03-18T14:22:00+01:00');
      expect(result).toContain('2026');
      expect(result).toContain('18');
    });

    test('returns empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });
  });

  describe('formatTimeAgo', () => {
    test('shows "just now" for recent timestamps', () => {
      var now = new Date().toISOString();
      expect(formatTimeAgo(now)).toBe('just now');
    });

    test('shows minutes ago', () => {
      var fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatTimeAgo(fiveMinAgo)).toBe('5 min ago');
    });

    test('shows hours ago', () => {
      var twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(twoHoursAgo)).toBe('2 hours ago');
    });

    test('shows days ago', () => {
      var threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(threeDaysAgo)).toBe('3 days ago');
    });
  });
});

describe('ui state rendering', () => {
  test('renderLoading shows spinner message', () => {
    var html = renderLoading();
    expect(html).toContain('loading');
    expect(html).toContain('Loading order data');
  });

  test('renderError shows error message and retry button', () => {
    var html = renderError('Something went wrong');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('id="refresh-btn"');
  });

  test('renderError escapes HTML in message', () => {
    var html = renderError('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renderNoOrders shows empty state with refresh button', () => {
    var html = renderNoOrders();
    expect(html).toContain('No Shopify orders found');
    expect(html).toContain('id="refresh-btn"');
  });

  test('renderStoreNotConfigured shows admin message', () => {
    var html = renderStoreNotConfigured();
    expect(html).toContain('Store not configured');
    expect(html).toContain('contact admin');
  });
});

var MOCK_DATA = {
  store_name: 'SolitSocks',
  shopify_domain: 'solitsocks.myshopify.com',
  customer_emails: ['john@example.com'],
  selected_order_id: '6001234567890',
  last_synced: new Date().toISOString(),
  orders: [
    {
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
      payment_method: 'Credit Card',
      tags: 'vip, repeat-customer',
      customer_note: 'Please gift wrap',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      line_items: [
        { title: 'Black Crew Socks (M)', sku: 'BCS-M-001', quantity: 1 },
        { title: 'White Ankle Socks (L)', sku: 'WAS-L-002', quantity: 2 },
      ],
    },
    {
      shopify_order_id: '6001234567891',
      order_name: '#1031',
      order_status: 'closed',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '29.95',
      currency: 'EUR',
      created_at: '2026-02-02T10:00:00+01:00',
      tracking_numbers: [],
      tracking_urls: [],
      payment_method: 'PayPal',
      tags: '',
      customer_note: '',
      shipping_address: 'John Doe\nKerkstraat 12\n6211 AB Maastricht\nNetherlands',
      line_items: [
        { title: 'Red Crew Socks (S)', sku: 'RCS-S-003', quantity: 3 },
      ],
    },
  ],
};

describe('ui order rendering', () => {
  describe('renderOrderSelector', () => {
    test('renders dropdown with multiple orders', () => {
      var html = renderOrderSelector(MOCK_DATA.orders, '6001234567890');
      expect(html).toContain('<select');
      expect(html).toContain('id="order-select"');
      expect(html).toContain('#1052');
      expect(html).toContain('#1031');
      expect(html).toContain('selected');
    });

    test('returns empty string for single order', () => {
      var html = renderOrderSelector([MOCK_DATA.orders[0]], '6001234567890');
      expect(html).toBe('');
    });
  });

  describe('renderOrderData', () => {
    test('renders full order display', () => {
      var html = renderOrderData(MOCK_DATA);
      expect(html).toContain('SolitSocks');
      expect(html).toContain('john@example.com');
      expect(html).toContain('#1052');
      expect(html).toContain('open');
      expect(html).toContain('paid');
      expect(html).toContain('fulfilled');
      expect(html).toContain('49.95');
      expect(html).toContain('EUR');
      expect(html).toContain('Credit Card');
      expect(html).toContain('3SXYZ123456');
      expect(html).toContain('tracking.example.com');
      expect(html).toContain('Black Crew Socks (M)');
      expect(html).toContain('White Ankle Socks (L)');
      expect(html).toContain('Kerkstraat 12');
      expect(html).toContain('vip, repeat-customer');
      expect(html).toContain('Please gift wrap');
      expect(html).toContain('id="refresh-btn"');
      expect(html).toContain('id="open-shopify"');
      expect(html).toContain('solitsocks.myshopify.com/admin/orders/6001234567890');
      expect(html).toContain('Last synced');
    });

    test('renders no-orders state when orders array is empty', () => {
      var emptyData = Object.assign({}, MOCK_DATA, { orders: [] });
      var html = renderOrderData(emptyData);
      expect(html).toContain('No Shopify orders found');
    });

    test('hides tracking section when no tracking numbers', () => {
      var data = Object.assign({}, MOCK_DATA, {
        selected_order_id: '6001234567891',
      });
      var html = renderOrderData(data);
      expect(html).not.toContain('tracking.example.com');
    });

    test('hides customer note when empty', () => {
      var data = Object.assign({}, MOCK_DATA, {
        selected_order_id: '6001234567891',
      });
      var html = renderOrderData(data);
      expect(html).not.toContain('Note');
    });
  });
});
