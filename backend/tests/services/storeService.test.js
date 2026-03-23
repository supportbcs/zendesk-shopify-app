jest.mock('../../src/firestore');
const firestore = require('../../src/firestore');
const { getStoreByName } = require('../../src/services/storeService');

describe('storeService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getStoreByName', () => {
    test('returns store config when found', async () => {
      const mockDoc = {
        exists: true,
        id: 'solitsocks',
        data: () => ({
          store_name: 'SolitSocks',
          shopify_domain: 'solitsocks.myshopify.com',
          secret_name: 'projects/my-project/secrets/shopify-solitsocks/versions/latest',
          is_active: true,
        }),
      };
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      });

      const store = await getStoreByName('SolitSocks');

      expect(firestore.collection).toHaveBeenCalledWith('stores');
      expect(store).toEqual({
        id: 'solitsocks',
        store_name: 'SolitSocks',
        shopify_domain: 'solitsocks.myshopify.com',
        secret_name: 'projects/my-project/secrets/shopify-solitsocks/versions/latest',
        is_active: true,
      });
    });

    test('returns null when store not found', async () => {
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      });

      const store = await getStoreByName('NonExistent');
      expect(store).toBeNull();
    });

    test('returns null when store is inactive', async () => {
      const mockDoc = {
        exists: true,
        id: 'oldstore',
        data: () => ({
          store_name: 'OldStore',
          is_active: false,
        }),
      };
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      });

      const store = await getStoreByName('OldStore');
      expect(store).toBeNull();
    });
  });
});
