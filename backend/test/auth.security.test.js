// Password change, admin password reset, login limits and the safety rules around them.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const User = require('../models/User');
const { resetLoginLimiter } = require('../middleware/rateLimit');
const { passwordProblem } = require('../utils/password');

describe('auth security', () => {
  let admin;
  let adminToken;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    resetLoginLimiter();
    admin = await createUser('admin', 'admin', 'Secret123');
    adminToken = tokenFor(admin);
  });

  const as = (token, req) => req.set('Authorization', `Bearer ${token}`);
  const login = (body) => request(app).post('/api/auth/login').send(body);

  describe('password rules', () => {
    it('accepts a normal password', () => {
      assert.equal(passwordProblem('Secret123'), null);
    });

    it('refuses short passwords, passwords without a number or letter, and text that is not text', () => {
      assert.ok(passwordProblem('Ab1'));
      assert.ok(passwordProblem('onlyletters'));
      assert.ok(passwordProblem('12345678'));
      assert.ok(passwordProblem(undefined));
      assert.ok(passwordProblem({ $gt: '' }));
    });

    it('refuses a password that bcrypt would cut off', () => {
      assert.ok(passwordProblem(`a1${'x'.repeat(80)}`));
    });
  });

  describe('login', () => {
    it('does not accept objects instead of text (database query tricks)', async () => {
      const res = await login({ username: { $gt: '' }, password: { $gt: '' } });

      assert.equal(res.status, 401);
    });

    it('gives the same answer for a wrong password and an unknown user', async () => {
      const wrongPassword = await login({ username: 'admin', password: 'Nope12345' });
      const unknownUser = await login({ username: 'ghost', password: 'Nope12345' });

      assert.equal(wrongPassword.status, 401);
      assert.deepEqual(wrongPassword.body, unknownUser.body);
    });

    it('blocks a username after 5 wrong passwords, even for the right password', async () => {
      for (let i = 0; i < 5; i++) {
        assert.equal((await login({ username: 'admin', password: 'Wrong12345' })).status, 401);
      }
      const blocked = await login({ username: 'admin', password: 'Secret123' });

      assert.equal(blocked.status, 429);
      assert.ok(blocked.headers['retry-after']);
    });

    it('does not block other usernames from the same address', async () => {
      for (let i = 0; i < 5; i++) await login({ username: 'admin', password: 'Wrong12345' });
      await createUser('maria', 'member', 'Secret123');

      assert.equal((await login({ username: 'maria', password: 'Secret123' })).status, 200);
    });

    it('starts counting again after a successful login', async () => {
      for (let i = 0; i < 4; i++) await login({ username: 'admin', password: 'Wrong12345' });
      assert.equal((await login({ username: 'admin', password: 'Secret123' })).status, 200);
      for (let i = 0; i < 4; i++) await login({ username: 'admin', password: 'Wrong12345' });

      assert.equal((await login({ username: 'admin', password: 'Secret123' })).status, 200);
    });
  });

  describe('PUT /api/auth/password', () => {
    const change = (token, body) => as(token, request(app).put('/api/auth/password')).send(body);

    it('changes the password: the new one works, the old one does not', async () => {
      const res = await change(adminToken, { currentPassword: 'Secret123', newPassword: 'Brandnew456' });

      assert.equal(res.status, 200);
      assert.equal((await login({ username: 'admin', password: 'Brandnew456' })).status, 200);
      assert.equal((await login({ username: 'admin', password: 'Secret123' })).status, 401);
    });

    it('answers with a new token that works', async () => {
      const res = await change(adminToken, { currentPassword: 'Secret123', newPassword: 'Brandnew456' });
      const me = await as(res.body.token, request(app).get('/api/auth/me'));

      assert.equal(me.status, 200);
    });

    it('logs out the older tokens', async () => {
      // A token made 60 seconds ago
      const old = jwt.sign(
        { userId: admin._id, iat: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_SECRET
      );
      await change(adminToken, { currentPassword: 'Secret123', newPassword: 'Brandnew456' });

      assert.equal((await as(old, request(app).get('/api/auth/me'))).status, 401);
    });

    it('refuses a wrong current password with 400 (not 401, that would log you out)', async () => {
      const res = await change(adminToken, { currentPassword: 'Wrong12345', newPassword: 'Brandnew456' });

      assert.equal(res.status, 400);
      assert.equal((await login({ username: 'admin', password: 'Secret123' })).status, 200);
    });

    it('refuses a weak new password and a repeat of the old one', async () => {
      assert.equal((await change(adminToken, { currentPassword: 'Secret123', newPassword: 'short1' })).status, 400);
      assert.equal((await change(adminToken, { currentPassword: 'Secret123', newPassword: 'Secret123' })).status, 400);
    });

    it('needs a login', async () => {
      const res = await request(app)
        .put('/api/auth/password')
        .send({ currentPassword: 'Secret123', newPassword: 'Brandnew456' });

      assert.equal(res.status, 401);
    });
  });

  describe('PUT /api/auth/users/:id/password', () => {
    it('lets an admin set a new password and logs that user out', async () => {
      const maria = await createUser('maria', 'member', 'Secret123');
      const old = jwt.sign(
        { userId: maria._id, iat: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_SECRET
      );
      const res = await as(adminToken, request(app).put(`/api/auth/users/${maria._id}/password`)).send({
        newPassword: 'Fresh12345'
      });

      assert.equal(res.status, 200);
      assert.equal((await login({ username: 'maria', password: 'Fresh12345' })).status, 200);
      assert.equal((await as(old, request(app).get('/api/auth/me'))).status, 401);
    });

    it('refuses a weak password', async () => {
      const maria = await createUser('maria');
      const res = await as(adminToken, request(app).put(`/api/auth/users/${maria._id}/password`)).send({
        newPassword: 'abc'
      });

      assert.equal(res.status, 400);
    });

    it('refuses members', async () => {
      const maria = await createUser('maria');
      const res = await as(tokenFor(maria), request(app).put(`/api/auth/users/${admin._id}/password`)).send({
        newPassword: 'Hacked12345'
      });

      assert.equal(res.status, 403);
      assert.equal((await login({ username: 'admin', password: 'Secret123' })).status, 200);
    });

    it('answers 404 for an unknown or malformed id', async () => {
      const res = await as(adminToken, request(app).put('/api/auth/users/not-an-id/password')).send({
        newPassword: 'Fresh12345'
      });

      assert.equal(res.status, 404);
    });
  });

  describe('register and delete safety', () => {
    it('refuses a weak password and an invalid role', async () => {
      const weak = await as(adminToken, request(app).post('/api/auth/register')).send({
        username: 'maria',
        password: '123'
      });
      const badRole = await as(adminToken, request(app).post('/api/auth/register')).send({
        username: 'maria',
        password: 'Secret123',
        role: 'superuser'
      });

      assert.equal(weak.status, 400);
      assert.equal(badRole.status, 400);
      assert.equal(await User.findOne({ username: 'maria' }), null);
    });

    it('does not hand out a login token for the new user', async () => {
      const res = await as(adminToken, request(app).post('/api/auth/register')).send({
        username: 'maria',
        password: 'Secret123'
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.token, undefined);
    });

    it('does not let an admin delete their own account', async () => {
      const other = await createUser('boss', 'admin');
      const res = await as(adminToken, request(app).delete(`/api/auth/users/${admin._id}`));

      assert.equal(res.status, 400);
      assert.ok(await User.findById(admin._id));
      assert.ok(other);
    });
  });

  describe('error messages', () => {
    it('does not show technical details to the browser', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"broken json');

      assert.equal(res.status, 400);
      assert.ok(!JSON.stringify(res.body).toLowerCase().includes('unexpected'));
    });

    it('sends security headers', async () => {
      const res = await request(app).get('/api/health');

      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-powered-by'], undefined);
    });
  });
});
