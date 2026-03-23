jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { cleanupOldCache } = require('../../src/services/cacheCleanupService');

describe('cacheCleanupService', () => {
  afterEach(() => jest.clearAllMocks());

  test('deletes documents older than 90 days', async () => {
    const mockDelete = jest.fn().mockResolvedValue();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const mockDocs = [
      {
        id: 'ticket-old-1',
        ref: { delete: mockDelete },
        data: () => ({ last_synced: oldDate.toISOString() }),
      },
      {
        id: 'ticket-old-2',
        ref: { delete: mockDelete },
        data: () => ({ last_synced: oldDate.toISOString() }),
      },
    ];

    firestore.collection = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn()
            .mockResolvedValueOnce({ empty: false, docs: mockDocs })
            .mockResolvedValueOnce({ empty: true, docs: [] }),
        }),
      }),
    });

    const result = await cleanupOldCache();

    expect(result.deleted).toBe(2);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  test('returns 0 when no old documents exist', async () => {
    firestore.collection = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    });

    const result = await cleanupOldCache();

    expect(result.deleted).toBe(0);
  });

  test('uses custom retention days', async () => {
    firestore.collection = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    });

    await cleanupOldCache({ retentionDays: 30 });

    const whereCall = firestore.collection().where;
    expect(whereCall).toHaveBeenCalledWith(
      'last_synced',
      '<',
      expect.any(String)
    );
  });
});
