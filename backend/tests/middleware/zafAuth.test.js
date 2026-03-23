const jwt = require('jsonwebtoken');

jest.mock('../../src/config', () => ({
  zafSharedSecret: 'test-zaf-secret',
}));

const { verifyZafToken } = require('../../src/middleware/zafAuth');

describe('zafAuth', () => {
  const makeReq = (token) => ({
    headers: { authorization: token ? `Bearer ${token}` : undefined },
  });

  test('allows valid JWT', () => {
    const token = jwt.sign({ sub: 'user123' }, 'test-zaf-secret', { expiresIn: '1h' });
    const req = makeReq(token);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyZafToken(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('rejects missing auth header', () => {
    const req = makeReq(null);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyZafToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid JWT', () => {
    const token = jwt.sign({ sub: 'user123' }, 'wrong-secret');
    const req = makeReq(token);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyZafToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
