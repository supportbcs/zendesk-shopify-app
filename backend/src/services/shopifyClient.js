const axios = require('axios');

const GATEWAY_LABELS = {
  shopify_payments: 'Shopify Payments',
  paypal: 'PayPal',
  manual: 'Manual',
  gift_card: 'Gift Card',
  'cash on delivery (cod)': 'Cash on Delivery',
};

function deriveOrderStatus(order) {
  if (order.cancelled_at) return 'cancelled';
  if (order.closed_at) return 'closed';
  return 'open';
}

function formatShippingAddress(addr) {
  if (!addr) return '';
  const parts = [
    [addr.first_name, addr.last_name].filter(Boolean).join(' '),
    addr.address1,
    addr.address2,
    [addr.zip, addr.city].filter(Boolean).join(' '),
    addr.province,
    addr.country,
  ];
  return parts.filter(Boolean).join('\n');
}

function formatPaymentMethod(gatewayNames) {
  if (!gatewayNames || gatewayNames.length === 0) return 'Unknown';
  const gateway = gatewayNames[0];
  return GATEWAY_LABELS[gateway] || gateway.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeOrder(order) {
  return {
    shopify_order_id: String(order.id),
    order_name: order.name,
    order_status: deriveOrderStatus(order),
    financial_status: order.financial_status || 'unknown',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    total_price: order.total_price,
    currency: order.currency,
    created_at: order.created_at,
    order_email: order.email || '',
    order_phone: order.phone || '',
    tracking_numbers: (order.fulfillments || [])
      .map(f => f.tracking_number)
      .filter(Boolean),
    tracking_urls: (order.fulfillments || [])
      .map(f => f.tracking_url)
      .filter(Boolean),
    tracking_companies: (order.fulfillments || [])
      .map(f => f.tracking_company)
      .filter(Boolean),
    payment_method: formatPaymentMethod(order.payment_gateway_names),
    discount_codes: (order.discount_codes || []).map(d => ({
      code: d.code || '',
      amount: d.amount || '0',
      type: d.type || '',
    })),
    refunds: (order.refunds || []).map(r => ({
      amount: (r.transactions || [])
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
        .toFixed(2),
      reason: r.note || '',
      created_at: r.created_at || '',
    })),
    tags: order.tags || '',
    customer_note: order.note || '',
    shipping_address: formatShippingAddress(order.shipping_address),
    billing_address: formatShippingAddress(order.billing_address),
    customer_orders_count: order.customer && order.customer.orders_count != null ? order.customer.orders_count : null,
    customer_total_spent: order.customer && order.customer.total_spent != null ? order.customer.total_spent : null,
    line_items: (order.line_items || []).map(item => ({
      title: [item.title, item.variant_title].filter(Boolean).join(' (') +
        (item.variant_title ? ')' : ''),
      sku: item.sku || '',
      quantity: item.quantity,
      fulfillment_status: item.fulfillment_status || 'unfulfilled',
    })),
  };
}

async function getOrdersByEmail({ shopifyDomain, apiToken, apiVersion, email }) {
  const url = `https://${shopifyDomain}/admin/api/${apiVersion}/orders.json`;

  const response = await axios.get(url, {
    params: { email, status: 'any', limit: 50 },
    headers: {
      'X-Shopify-Access-Token': apiToken,
      'Content-Type': 'application/json',
    },
  });

  return (response.data.orders || []).map(normalizeOrder);
}

module.exports = { getOrdersByEmail, normalizeOrder };
