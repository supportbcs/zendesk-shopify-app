const axios = require('axios');
const { shopifyRateLimiter } = require('./rateLimiter');
const { recordSuccess, recordError } = require('./storeHealthService');

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

function formatPaymentMethod(gatewayNames, paymentMethodName) {
  if (!gatewayNames || gatewayNames.length === 0) return 'Unknown';
  const gateway = gatewayNames[0];
  const gatewayLabel = GATEWAY_LABELS[gateway] || gateway.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (paymentMethodName && paymentMethodName !== gateway) {
    const methodLabel = paymentMethodName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `${gatewayLabel} (${methodLabel})`;
  }
  return gatewayLabel;
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
    payment_method: formatPaymentMethod(order.payment_gateway_names, order._payment_method_name),
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
    customer_first_name: order.customer && order.customer.first_name ? order.customer.first_name : '',
    customer_last_name: order.customer && order.customer.last_name ? order.customer.last_name : '',
    line_items: (order.line_items || []).map(item => ({
      title: [item.title, item.variant_title].filter(Boolean).join(' (') +
        (item.variant_title ? ')' : ''),
      sku: item.sku || '',
      quantity: item.quantity,
      fulfillment_status: item.fulfillment_status || 'unfulfilled',
    })),
  };
}

async function getOrdersByEmail({ shopifyDomain, apiToken, apiVersion, email, storeId }) {
  if (!email) return [];

  const baseUrl = `https://${shopifyDomain}/admin/api/${apiVersion}`;
  const rateLimitKey = storeId || shopifyDomain;
  const headers = {
    'X-Shopify-Access-Token': apiToken,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Fetch orders list
    const ordersResponse = await shopifyRateLimiter.schedule(rateLimitKey, () =>
      axios.get(`${baseUrl}/orders.json`, {
        params: { email, status: 'any', limit: 50 },
        headers,
      })
    );
    const orders = ordersResponse.data.orders || [];

    // 2. Fetch transactions per order to get specific payment method
    await Promise.all(orders.map(async (order) => {
      try {
        const txResponse = await shopifyRateLimiter.schedule(rateLimitKey, () =>
          axios.get(`${baseUrl}/orders/${order.id}/transactions.json`, { headers })
        );
        const transactions = txResponse.data.transactions || [];
        const paymentTx = transactions.find(t =>
          (t.kind === 'sale' || t.kind === 'capture') &&
          t.status === 'success' &&
          t.payment_details
        );
        order._payment_method_name = paymentTx?.payment_details?.payment_method_name || null;
      } catch {
        // If transaction fetch fails, fall back to gateway name only
        order._payment_method_name = null;
      }
    }));

    if (storeId) await recordSuccess(storeId);
    return orders.map(normalizeOrder);
  } catch (err) {
    if (storeId) await recordError(storeId, err.message);
    throw err;
  }
}

module.exports = { getOrdersByEmail, normalizeOrder };
