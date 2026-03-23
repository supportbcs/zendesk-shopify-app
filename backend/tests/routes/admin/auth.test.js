const request = require('supertest');

jest.mock('../../../src/firebase', () => {
  const verifyIdToken = jest.fn();
  return {
    auth: () => ({ verifyIdToken }),
    __verifyIdToken: verifyIdToken,
  };
});
jest.mock('../../../src/services/adminUserService');
jest.mock('../../../src/config', () => ({
  zendeskWebhookSecret: 'test-secret',
  zafSharedSecret: 'test-zaf-secret',
}));

const firebaseAdmin = require('../../../src/firebase');
const adminUserService = require('../../../src/services/adminUserService');
const createApp = require('../../../src/app');

describe('POST /api/admin/auth/verify', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterEach(() => jest.clearAllMocks());

  test('returns user info for authorized user', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user1',
      email: 'jeff@backbonecustomerservice.com',
      email_verified: true,
      name: 'Jeff',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/admin/auth/verify')
      .set('Authorization', 'Bearer valid-firebase-token');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('jeff@backbonecustomerservice.com');
    expect(res.body.name).toBe('Jeff');
  });

  test('returns 403 for unauthorized user', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user2',
      email: 'stranger@gmail.com',
      email_verified: true,
      name: 'Stranger',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/admin/auth/verify')
      .set('Authorization', 'Bearer valid-firebase-token');

    expect(res.status).toBe(403);
  });
});
