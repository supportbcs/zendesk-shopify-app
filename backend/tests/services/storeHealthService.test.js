jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { recordSuccess, recordError } = require('../../src/services/storeHealthService');

describe('storeHealthService', () => {
  afterEach(() => jest.clearAllMocks());

  const mockSet = jest.fn().mockResolvedValue();

  beforeEach(() => {
    firestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        set: mockSet,
      }),
    });
  });

  test('recordSuccess updates last_successful_sync and clears last_error', async () => {
    await recordSuccess('solitsocks');

    expect(firestore.collection).toHaveBeenCalledWith('stores');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        last_successful_sync: expect.any(String),
        last_error: null,
      }),
      { merge: true }
    );
  });

  test('recordError updates last_error with message and timestamp', async () => {
    await recordError('solitsocks', 'API token expired');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error: expect.objectContaining({
          message: 'API token expired',
          timestamp: expect.any(String),
        }),
      }),
      { merge: true }
    );
  });
});
