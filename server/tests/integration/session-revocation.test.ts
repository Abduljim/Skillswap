/**
 * Session revocation — integration tests against the real app + database.
 *
 * Before `tokenVersion` existed, logout only cleared the cookie: the JWT stayed
 * valid for up to 365 days (JWT_EXPIRES_IN), and the same token is returned in
 * the response body, so a copied token kept working after logout, password
 * change and even admin deactivation.
 */
import {
  api,
  signup,
  login,
  resetDatabase,
  makeAdmin,
  createDbUser,
  prisma,
  PASSWORD,
} from '../helpers/api';

describe('Session revocation (tokenVersion)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts the session cookie immediately after signup', async () => {
    const session = await signup('rev-1@skillswap.test', 'Rev One');

    const me = await api().get('/api/auth/me').set('Cookie', session.cookie).expect(200);
    expect(me.body.data.email).toBe('rev-1@skillswap.test');
  });

  it('rejects the same cookie after logout', async () => {
    const session = await signup('rev-2@skillswap.test', 'Rev Two');

    await api().post('/api/auth/logout').set('Cookie', session.cookie).expect(200);

    // The cookie is unchanged, but the token behind it has been revoked.
    await api().get('/api/auth/me').set('Cookie', session.cookie).expect(401);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { tokenVersion: true },
    });
    expect(user?.tokenVersion).toBe(1);
  });

  it('rejects the bearer token from the response body after logout too', async () => {
    const session = await signup('rev-3@skillswap.test', 'Rev Three');

    // The token is also handed back in the JSON body (used by the native app for
    // the Socket.IO handshake), so it must be revoked as well.
    await api().get('/api/auth/me').set('Authorization', `Bearer ${session.token}`).expect(200);
    await api().post('/api/auth/logout').set('Cookie', session.cookie).expect(200);
    await api().get('/api/auth/me').set('Authorization', `Bearer ${session.token}`).expect(401);
  });

  it('revokes every session when the password is changed, and a fresh login works', async () => {
    const session = await signup('rev-4@skillswap.test', 'Rev Four');

    await api()
      .post('/api/auth/change-password')
      .set('Cookie', session.cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'N3wPassword!' })
      .expect(200);

    await api().get('/api/auth/me').set('Cookie', session.cookie).expect(401);

    const fresh = await login('rev-4@skillswap.test', 'N3wPassword!');
    await api().get('/api/auth/me').set('Cookie', fresh.cookie).expect(200);
  });

  it('rejects the cookie after an admin deactivates the account', async () => {
    const admin = await signup('rev-admin@skillswap.test', 'Admin');
    await makeAdmin(admin.userId);

    const target = await signup('rev-target@skillswap.test', 'Target');
    await api().get('/api/auth/me').set('Cookie', target.cookie).expect(200);

    await api()
      .put(`/api/admin/users/${target.userId}`)
      .set('Cookie', admin.cookie)
      .send({ isActive: false })
      .expect(200);

    await api().get('/api/auth/me').set('Cookie', target.cookie).expect(401);
  });

  it('does not revoke sessions when an admin only toggles isAdmin', async () => {
    const admin = await signup('rev-admin2@skillswap.test', 'Admin Two');
    await makeAdmin(admin.userId);

    const target = await signup('rev-promote@skillswap.test', 'Promote Me');

    await api()
      .put(`/api/admin/users/${target.userId}`)
      .set('Cookie', admin.cookie)
      .send({ isAdmin: true })
      .expect(200);

    // Promoting is not a security event for the target's existing session.
    await api().get('/api/auth/me').set('Cookie', target.cookie).expect(200);
  });

  it('rejects duplicate signups and wrong passwords without leaking which', async () => {
    await signup('rev-5@skillswap.test', 'Rev Five');

    const dup = await api()
      .post('/api/auth/signup')
      .send({ email: 'rev-5@skillswap.test', password: PASSWORD, displayName: 'Copycat' })
      .expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    // Same message for "no such user" and "wrong password".
    const wrongUser = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@skillswap.test', password: PASSWORD })
      .expect(401);
    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email: 'rev-5@skillswap.test', password: 'WrongPassword1!' })
      .expect(401);
    expect(wrongUser.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('rejects a token minted for a user that no longer exists', async () => {
    const orphan = await createDbUser('rev-orphan@skillswap.test', 'Orphan');
    const token = await (async () => {
      const { signToken } = await import('../../src/middleware/auth');
      return signToken({ userId: orphan.id, email: orphan.email, tokenVersion: 0 });
    })();

    await prisma.user.delete({ where: { id: orphan.id } });

    await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });
});
