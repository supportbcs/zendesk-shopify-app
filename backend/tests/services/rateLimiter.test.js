const { RateLimiter } = require('../../src/services/rateLimiter');

describe('RateLimiter', () => {
  test('executes a single request immediately', async () => {
    const limiter = new RateLimiter({ delayMs: 0 });
    const fn = jest.fn().mockResolvedValue('result');

    const result = await limiter.schedule('store-a', fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('queues requests for the same store', async () => {
    const callOrder = [];
    const limiter = new RateLimiter({ delayMs: 10 });

    const fn1 = jest.fn().mockImplementation(async () => {
      callOrder.push(1);
      return 'a';
    });
    const fn2 = jest.fn().mockImplementation(async () => {
      callOrder.push(2);
      return 'b';
    });

    const [r1, r2] = await Promise.all([
      limiter.schedule('store-a', fn1),
      limiter.schedule('store-a', fn2),
    ]);

    expect(r1).toBe('a');
    expect(r2).toBe('b');
    expect(callOrder).toEqual([1, 2]);
  });

  test('runs different stores in parallel', async () => {
    const limiter = new RateLimiter({ delayMs: 50 });
    const running = [];

    const makeFn = (store) => jest.fn().mockImplementation(async () => {
      running.push(store);
      await new Promise(r => setTimeout(r, 10));
      return store;
    });

    const [r1, r2] = await Promise.all([
      limiter.schedule('store-a', makeFn('store-a')),
      limiter.schedule('store-b', makeFn('store-b')),
    ]);

    expect(r1).toBe('store-a');
    expect(r2).toBe('store-b');
    // Both should have started (in parallel)
    expect(running).toContain('store-a');
    expect(running).toContain('store-b');
  });

  test('retries on 429 with backoff', async () => {
    const limiter = new RateLimiter({ delayMs: 0, maxRetries: 3, baseBackoffMs: 10 });

    const error429 = new Error('Rate limited');
    error429.response = { status: 429 };

    const fn = jest.fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('success');

    const result = await limiter.schedule('store-a', fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after max retries on 429', async () => {
    const limiter = new RateLimiter({ delayMs: 0, maxRetries: 2, baseBackoffMs: 10 });

    const error429 = new Error('Rate limited');
    error429.response = { status: 429 };

    const fn = jest.fn().mockRejectedValue(error429);

    await expect(limiter.schedule('store-a', fn)).rejects.toThrow('Rate limited');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('does not retry on non-429 errors', async () => {
    const limiter = new RateLimiter({ delayMs: 0, maxRetries: 3, baseBackoffMs: 10 });

    const error500 = new Error('Server error');
    error500.response = { status: 500 };

    const fn = jest.fn().mockRejectedValue(error500);

    await expect(limiter.schedule('store-a', fn)).rejects.toThrow('Server error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
