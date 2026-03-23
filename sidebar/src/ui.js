function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  var now = Date.now();
  var then = new Date(isoString).getTime();
  var diffMs = now - then;
  var diffMin = Math.floor(diffMs / 60000);
  var diffHrs = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return diffMin + ' min ago';
  if (diffHrs < 24) return diffHrs + ' hours ago';
  return diffDays + ' days ago';
}

function renderLoading() {
  return '<div class="state-message loading">' +
    '<div class="spinner"></div>' +
    '<p>Loading order data...</p>' +
    '</div>';
}

function renderError(message) {
  return '<div class="state-message error">' +
    '<p>' + escapeHtml(message) + '</p>' +
    '<button id="refresh-btn" class="c-btn c-btn--primary">Retry</button>' +
    '</div>';
}

function renderNoOrders() {
  return '<div class="state-message empty">' +
    '<p>No Shopify orders found for this customer.</p>' +
    '<button id="refresh-btn" class="c-btn c-btn--primary">Refresh</button>' +
    '</div>';
}

function renderStoreNotConfigured() {
  return '<div class="state-message error">' +
    '<p>Store not configured — contact admin.</p>' +
    '</div>';
}

function renderOrderSelector(orders, selectedOrderId) {
  if (!orders || orders.length <= 1) return '';

  var options = orders.map(function (order) {
    var date = formatDate(order.created_at);
    var selected = order.shopify_order_id === selectedOrderId ? ' selected' : '';
    return '<option value="' + escapeHtml(order.shopify_order_id) + '"' + selected + '>' +
      escapeHtml(order.order_name) + ' (' + escapeHtml(date) + ')' +
      '</option>';
  }).join('');

  return '<div class="order-selector">' +
    '<select id="order-select" class="c-txt__input">' + options + '</select>' +
    '</div>';
}

function renderTrackingSection(order) {
  if (!order.tracking_numbers || order.tracking_numbers.length === 0) return '';

  var links = order.tracking_numbers.map(function (num, i) {
    var url = order.tracking_urls && order.tracking_urls[i];
    if (url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
        escapeHtml(num) + '</a>';
    }
    return '<span>' + escapeHtml(num) + '</span>';
  }).join(', ');

  return '<div class="field">' +
    '<span class="label">Tracking</span>' +
    '<span class="value">' + links + '</span>' +
    '</div>';
}

function renderLineItems(items) {
  if (!items || items.length === 0) return '';

  var listItems = items.map(function (item) {
    return '<li>' + escapeHtml(item.quantity) + 'x ' + escapeHtml(item.title) + '</li>';
  }).join('');

  return '<div class="field">' +
    '<span class="label">Products</span>' +
    '<ul class="product-list">' + listItems + '</ul>' +
    '</div>';
}

function renderOrderData(data) {
  if (!data.orders || data.orders.length === 0) {
    return renderNoOrders();
  }

  var selectedId = data.selected_order_id;
  var order = data.orders.find(function (o) { return o.shopify_order_id === selectedId; });
  if (!order) order = data.orders[0];

  var shopifyUrl = 'https://' + escapeHtml(data.shopify_domain) +
    '/admin/orders/' + escapeHtml(order.shopify_order_id);

  var shippingHtml = '';
  if (order.shipping_address) {
    shippingHtml = '<div class="field">' +
      '<span class="label">Shipping</span>' +
      '<span class="value address">' + escapeHtml(order.shipping_address).replace(/\n/g, '<br>') + '</span>' +
      '</div>';
  }

  var tagsHtml = '';
  if (order.tags) {
    tagsHtml = '<div class="field">' +
      '<span class="label">Tags</span>' +
      '<span class="value">' + escapeHtml(order.tags) + '</span>' +
      '</div>';
  }

  var noteHtml = '';
  if (order.customer_note) {
    noteHtml = '<div class="field">' +
      '<span class="label">Note</span>' +
      '<span class="value">&ldquo;' + escapeHtml(order.customer_note) + '&rdquo;</span>' +
      '</div>';
  }

  return '<div class="sidebar-content">' +
    '<div class="header">' +
      '<h2>Shopify Order Data</h2>' +
      '<div class="field"><span class="label">Store</span><span class="value">' + escapeHtml(data.store_name) + '</span></div>' +
      '<div class="field"><span class="label">Customer</span><span class="value">' + escapeHtml((data.customer_emails || [])[0] || '') + '</span></div>' +
    '</div>' +
    renderOrderSelector(data.orders, order.shopify_order_id) +
    '<div class="order-details">' +
      '<div class="field"><span class="label">Status</span><span class="value badge badge-' + escapeHtml(order.order_status) + '">' + escapeHtml(order.order_status) + '</span></div>' +
      '<div class="field"><span class="label">Payment</span><span class="value">' + escapeHtml(order.financial_status) + '</span></div>' +
      '<div class="field"><span class="label">Fulfillment</span><span class="value">' + escapeHtml(order.fulfillment_status) + '</span></div>' +
      '<div class="field"><span class="label">Total</span><span class="value">' + escapeHtml(order.total_price) + ' ' + escapeHtml(order.currency) + '</span></div>' +
      '<div class="field"><span class="label">Payment Method</span><span class="value">' + escapeHtml(order.payment_method) + '</span></div>' +
      '<div class="field"><span class="label">Date</span><span class="value">' + formatDate(order.created_at) + '</span></div>' +
      renderTrackingSection(order) +
      renderLineItems(order.line_items) +
      shippingHtml +
      tagsHtml +
      noteHtml +
    '</div>' +
    '<div class="actions">' +
      '<button id="refresh-btn" class="c-btn">Refresh</button>' +
      '<a id="open-shopify" href="' + shopifyUrl + '" target="_blank" rel="noopener" class="c-btn c-btn--primary">Open in Shopify &#x2197;</a>' +
    '</div>' +
    '<div class="last-synced">Last synced: ' + formatTimeAgo(data.last_synced) + '</div>' +
    '</div>';
}

module.exports = {
  escapeHtml: escapeHtml,
  formatDate: formatDate,
  formatTimeAgo: formatTimeAgo,
  renderLoading: renderLoading,
  renderError: renderError,
  renderNoOrders: renderNoOrders,
  renderStoreNotConfigured: renderStoreNotConfigured,
  renderOrderSelector: renderOrderSelector,
  renderOrderData: renderOrderData,
};
