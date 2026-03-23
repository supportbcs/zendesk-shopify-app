const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn().mockResolvedValue({
    uid: 'admin1',
    email: 'jeff@backbonecustomerservice.com',
    email_verified: true,
    name: 'Jeff',
  });
  return {
    auth: () => ({ verifyIdToken }),
    __verifyIdToken: verifyIdToken,
  };
});
jest.mock('../../../src/services/adminUserService', () => ({
  isEmailAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/firestore');
jest.mock('../../../src/services/secretManager');
jest.mock('../../../src/services/shopifyClient');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
  gcpProjectId: 'test-project',
  shopifyApiVersion: '2025-01',
}));

const firestore = require('../../../src/firestore');
const secretManager = require('../../../src/services/secretManager');
const shopifyClient = require('../../../src/services/shopifyClient');
const createApp = require('../../../src/app');

describe('Admin Stores API', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /api/admin/stores', () => {
    test('returns all stores', async () => {
      const mockDocs = [
        { id: 'solitsocks', data: () => ({ store_name: 'SolitSocks', shopify_domain: 'solitsocks.myshopify.com', is_active: true }) },
        { id: 'hornbad', data: () => ({ store_name: 'Hornbad', shopify_domain: 'hornbad.myshopify.com', is_active: true }) },
      ];
      firestore.collection = jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: mockDocs }),
        }),
      });

      const res = await request(app)
        .get('/api/admin/stores')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.stores).toHaveLength(2);
      expect(res.body.stores[0].store_name).toBe('SolitSocks');
    });
  });

  describe('POST /api/admin/stores', () => {
    test('creates a new store', async () => {
      const mockSet = jest.fn().mockResolvedValue();
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          set: mockSet,
        }),
      });
      secretManager.createSecret.mockResolvedValue(
        'projects/test-project/secrets/shopify-newstore/versions/latest'
      );

      const res = await request(app)
        .post('/api/admin/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({
          store_name: 'NewStore',
          shopify_domain: 'newstore.myshopify.com',
          api_token: 'shpat_new123',
        });

      expect(res.status).toBe(201);
      expect(secretManager.createSecret).toHaveBeenCalledWith(
        'shopify-shop_name_newstore',
        'shpat_new123'
      );
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: 'NewStore',
          shopify_domain: 'newstore.myshopify.com',
          is_active: true,
        })
      );
    });

    test('returns 409 if store already exists', async () => {
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: true }),
        }),
      });

      const res = await request(app)
        .post('/api/admin/stores')
        .set('Authorization', 'Bearer valid-token')
        .send({
          store_name: 'ExistingStore',
          shopify_domain: 'existing.myshopify.com',
          api_token: 'shpat_test',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/admin/stores/:id', () => {
    test('deletes store and its secret', async () => {
      const mockDelete = jest.fn().mockResolvedValue();
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ store_name: 'OldStore' }),
          }),
          delete: mockDelete,
        }),
      });
      secretManager.deleteSecret.mockResolvedValue();

      const res = await request(app)
        .delete('/api/admin/stores/oldstore')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockDelete).toHaveBeenCalled();
      expect(secretManager.deleteSecret).toHaveBeenCalledWith('shopify-oldstore');
    });
  });

  describe('PUT /api/admin/stores/:id', () => {
    test('updates store fields', async () => {
      const mockSet = jest.fn().mockResolvedValue();
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              store_name: 'OldName',
              shopify_domain: 'old.myshopify.com',
              secret_name: 'projects/p/secrets/shopify-oldname/versions/latest',
            }),
          }),
          set: mockSet,
        }),
      });
      secretManager.updateSecret = jest.fn().mockResolvedValue();

      const res = await request(app)
        .put('/api/admin/stores/oldname')
        .set('Authorization', 'Bearer valid-token')
        .send({ store_name: 'NewName', shopify_domain: 'new.myshopify.com' });

      expect(res.status).toBe(200);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ store_name: 'NewName', shopify_domain: 'new.myshopify.com' }),
        { merge: true }
      );
    });
  });

  describe('POST /api/admin/stores/:id/test', () => {
    test('tests connection to Shopify', async () => {
      firestore.collection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              store_name: 'TestStore',
              shopify_domain: 'teststore.myshopify.com',
              secret_name: 'projects/p/secrets/s/versions/latest',
            }),
          }),
        }),
      });
      secretManager.getSecret.mockResolvedValue('shpat_test');
      shopifyClient.getOrdersByEmail.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/admin/stores/teststore/test')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
