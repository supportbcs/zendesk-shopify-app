function buildRequest(path, options) {
  var opts = options || {};
  var req = {
    url: '{{setting.backendUrl}}' + path,
    type: opts.method || 'GET',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer {{jwt.token}}',
    },
    jwt: {
      algorithm: 'HS256',
      secret_key: '{{setting.shared_secret}}',
      expiry: 3600,
    },
    secure: true,
  };

  if (opts.body) {
    req.data = JSON.stringify(opts.body);
  }

  return req;
}

function getOrders(client, ticketId) {
  return client.request(
    buildRequest('/api/orders?ticketId=' + encodeURIComponent(ticketId))
  );
}

function triggerLookup(client, ticketId) {
  return client.request(
    buildRequest('/api/lookup', {
      method: 'POST',
      body: { ticketId: String(ticketId) },
    })
  );
}

function selectOrder(client, ticketId, orderId) {
  return client.request(
    buildRequest('/api/select-order', {
      method: 'POST',
      body: { ticketId: String(ticketId), orderId: String(orderId) },
    })
  );
}

module.exports = { buildRequest, getOrders, triggerLookup, selectOrder };
