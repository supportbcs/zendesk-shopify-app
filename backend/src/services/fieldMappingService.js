const firestore = require('../firestore');

async function getEnabledMappings() {
  const doc = await firestore.collection('field_mappings').doc('global').get();
  if (!doc.exists) return [];
  const data = doc.data();
  return (data.mappings || []).filter(m => m.enabled);
}

function resolveField(order, fieldName) {
  const directFields = {
    order_name: order.order_name,
    order_status: order.order_status,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    total_price: `${order.total_price} ${order.currency}`,
    order_date: order.created_at,
    tracking_numbers: (order.tracking_numbers || []).join(', '),
    tracking_urls: (order.tracking_urls || []).join(', '),
    payment_method: order.payment_method,
    tags: order.tags,
    customer_note: order.customer_note,
    shipping_address: order.shipping_address,
  };

  if (fieldName in directFields) {
    return directFields[fieldName];
  }

  const lineItemMatch = fieldName.match(/^line_item_(\d+)_(title|sku|quantity)$/);
  if (lineItemMatch) {
    const index = parseInt(lineItemMatch[1], 10) - 1;
    const prop = lineItemMatch[2];
    const item = (order.line_items || [])[index];
    if (!item) return '';
    return String(item[prop] ?? '');
  }

  return '';
}

function buildTicketFields(order, mappings) {
  return mappings.map(mapping => ({
    id: mapping.zendesk_field_id,
    value: resolveField(order, mapping.shopify_field),
  }));
}

function normalizeTag(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildProductTags(order) {
  const items = (order.line_items || []).slice(0, 5);
  return items
    .map(item => item.title)
    .filter(Boolean)
    .map(title => 'product-' + normalizeTag(title))
    .filter(tag => tag.length > 'product-'.length);
}

module.exports = { getEnabledMappings, buildTicketFields, buildProductTags };
