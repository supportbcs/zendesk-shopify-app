function defaultDelay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function pollForOrders(fetchFn, options) {
  var opts = options || {};
  var interval = opts.interval || 2000;
  var maxRetries = opts.maxRetries || 5;
  var delay = opts.delayFn || defaultDelay;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (err) {
      if (err && err.status && err.status !== 404) {
        throw err;
      }
      if (attempt < maxRetries - 1) {
        await delay(interval);
      }
    }
  }

  throw new Error('max_retries');
}

module.exports = { pollForOrders };
