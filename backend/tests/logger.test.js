const { createLogger } = require('../src/logger');

describe('logger', () => {
  let originalWrite;
  let output;

  beforeEach(() => {
    output = [];
    originalWrite = process.stdout.write;
    process.stdout.write = jest.fn((chunk) => {
      output.push(chunk);
      return true;
    });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  test('info outputs JSON with level, message, and timestamp', () => {
    const logger = createLogger();
    logger.info('test message');

    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed.severity).toBe('INFO');
    expect(parsed.message).toBe('test message');
    expect(parsed.timestamp).toBeDefined();
  });

  test('error includes error details', () => {
    const logger = createLogger();
    logger.error('lookup failed', { ticketId: '123', error: 'timeout' });

    const parsed = JSON.parse(output[0]);
    expect(parsed.severity).toBe('ERROR');
    expect(parsed.message).toBe('lookup failed');
    expect(parsed.ticketId).toBe('123');
    expect(parsed.error).toBe('timeout');
  });

  test('warn outputs WARNING severity', () => {
    const logger = createLogger();
    logger.warn('store not found', { storeName: 'TestStore' });

    const parsed = JSON.parse(output[0]);
    expect(parsed.severity).toBe('WARNING');
    expect(parsed.storeName).toBe('TestStore');
  });

  test('child logger includes parent context', () => {
    const logger = createLogger();
    const child = logger.child({ component: 'webhook' });
    child.info('received');

    const parsed = JSON.parse(output[0]);
    expect(parsed.component).toBe('webhook');
    expect(parsed.message).toBe('received');
  });
});
