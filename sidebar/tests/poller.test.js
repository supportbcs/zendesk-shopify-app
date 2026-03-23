const { pollForOrders } = require('../src/poller');

describe('poller', () => {
  test('returns data on first success', async () => {
    var fetchFn = jest.fn().mockResolvedValue({ orders: [{ order_name: '#1' }] });
    var delayFn = jest.fn().mockResolvedValue();

    var result = await pollForOrders(fetchFn, { maxRetries: 5, interval: 2000, delayFn: delayFn });

    expect(result.orders).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
  });

  test('retries on 404 until data arrives', async () => {
    var fetchFn = jest.fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ orders: [{ order_name: '#1' }] });
    var delayFn = jest.fn().mockResolvedValue();

    var result = await pollForOrders(fetchFn, { maxRetries: 5, interval: 2000, delayFn: delayFn });

    expect(result.orders).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
    expect(delayFn).toHaveBeenCalledWith(2000);
  });

  test('throws max_retries after exhausting attempts', async () => {
    var fetchFn = jest.fn().mockRejectedValue({ status: 404 });
    var delayFn = jest.fn().mockResolvedValue();

    await expect(
      pollForOrders(fetchFn, { maxRetries: 3, interval: 1000, delayFn: delayFn })
    ).rejects.toThrow('max_retries');

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
  });

  test('throws immediately on non-404 errors', async () => {
    var fetchFn = jest.fn().mockRejectedValue({ status: 500, responseText: 'Server error' });
    var delayFn = jest.fn().mockResolvedValue();

    await expect(
      pollForOrders(fetchFn, { maxRetries: 5, interval: 2000, delayFn: delayFn })
    ).rejects.toEqual({ status: 500, responseText: 'Server error' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
  });
});
