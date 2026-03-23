jest.mock('../../src/firebase', () => {
  const verifyIdToken = jest.fn();
  return {
    auth: () => ({ verifyIdToken }),
    __verifyIdToken: verifyIdToken,
  };
});

jest.mock('../../src/services/adminUserService');

const firebaseAdmin = require('../../src/firebase');
const adminUserService = require('../../src/services/adminUserService');
const { verifyAdminToken } = require('../../src/middleware/adminAuth');

describe('adminAuth middleware', () => {
  afterEach(() => jest.clearAllMocks());

  function makeReq(token) {
    return {
      headers: { authorization: token ? 'Bearer ' + token : undefined },
    };
  }

  function makeRes() {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    return res;
  }

  test('allows valid token with whitelisted email', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user1',
      email: 'jeff@backbonecustomerservice.com',
      email_verified: true,
      name: 'Jeff',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(true);

    const req = makeReq('valid-token');
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminUser.email).toBe('jeff@backbonecustomerservice.com');
  });

  test('rejects missing authorization header', async () => {
    const req = makeReq(null);
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects non-whitelisted email', async () => {
    firebaseAdmin.__verifyIdToken.mockResolvedValue({
      uid: 'user2',
      email: 'stranger@gmail.com',
      email_verified: true,
      name: 'Stranger',
    });
    adminUserService.isEmailAllowed.mockResolvedValue(false);

    const req = makeReq('valid-token');
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid token', async () => {
    firebaseAdmin.__verifyIdToken.mockRejectedValue(
      new Error('auth/invalid-id-token')
    );

    const req = makeReq('bad-token');
    const res = makeRes();
    const next = jest.fn();

    await verifyAdminToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
