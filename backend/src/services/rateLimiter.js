const { logger } = require('../logger');

class RateLimiter {
  constructor({ delayMs = 500, maxRetries = 3, baseBackoffMs = 1000 } = {}) {
    this.delayMs = delayMs;
    this.maxRetries = maxRetries;
    this.baseBackoffMs = baseBackoffMs;
    this.queues = new Map(); // storeId -> Promise chain
  }

  async schedule(storeId, fn) {
    // Chain onto existing queue for this store, or start new
    const previous = this.queues.get(storeId) || Promise.resolve();

    const next = previous
      .catch(() => {}) // Don't let previous failures block the queue
      .then(() => this._delay())
      .then(() => this._executeWithRetry(storeId, fn));

    this.queues.set(storeId, next);

    try {
      return await next;
    } finally {
      // Clean up queue if this was the last item
      if (this.queues.get(storeId) === next) {
        this.queues.delete(storeId);
      }
    }
  }

  async _executeWithRetry(storeId, fn, attempt = 0) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < this.maxRetries) {
        const backoff = this.baseBackoffMs * Math.pow(2, attempt);
        logger.warn('Rate limited by Shopify, retrying', {
          storeId,
          attempt: attempt + 1,
          backoffMs: backoff,
        });
        await new Promise(r => setTimeout(r, backoff));
        return this._executeWithRetry(storeId, fn, attempt + 1);
      }
      throw err;
    }
  }

  _delay() {
    if (this.delayMs <= 0) return Promise.resolve();
    return new Promise(r => setTimeout(r, this.delayMs));
  }
}

// Singleton instance with production defaults
const shopifyRateLimiter = new RateLimiter();

module.exports = { RateLimiter, shopifyRateLimiter };
