function buildRequest(baseUrl, path, options) {
  var opts = options || {};
  var req = {
    url: baseUrl + path,
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

function getOrders(client, baseUrl, ticketId) {
  return client.request(
    buildRequest(baseUrl, '/api/orders?ticketId=' + encodeURIComponent(ticketId))
  );
}

function triggerLookup(client, baseUrl, ticketId) {
  return client.request(
    buildRequest(baseUrl, '/api/lookup', {
      method: 'POST',
      body: { ticketId: String(ticketId) },
    })
  );
}

function selectOrder(client, baseUrl, ticketId, orderId) {
  return client.request(
    buildRequest(baseUrl, '/api/select-order', {
      method: 'POST',
      body: { ticketId: String(ticketId), orderId: String(orderId) },
    })
  );
}

module.exports = { buildRequest, getOrders, triggerLookup, selectOrder };
