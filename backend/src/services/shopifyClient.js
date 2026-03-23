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
    tracking_numbers: (order.fulfillments || [])
      .map(f => f.tracking_number)
      .filter(Boolean),
    tracking_urls: (order.fulfillments || [])
      .map(f => f.tracking_url)
      .filter(Boolean),
    payment_method: formatPaymentMethod(order.payment_gateway_names),
    tags: order.tags || '',
    customer_note: order.note || '',
    shipping_address: formatShippingAddress(order.shipping_address),
    line_items: (order.line_items || []).map(item => ({
      title: [item.title, item.variant_title].filter(Boolean).join(' (') +
        (item.variant_title ? ')' : ''),
      sku: item.sku || '',
      quantity: item.quantity,
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
