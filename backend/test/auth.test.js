// Login, current user, and the admin-only user management.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const User = require('../models/User');

describe('auth', () => {
  let admin;
  let adminToken;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    admin = await createUser('admin', 'admin', 'Secret123');
    adminToken = tokenFor(admin);
  });

  const login = (body) => request(app).post('/api/auth/login').send(body);
  const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  describe('POST /api/auth/login', () => {
    it('gives a token and the user for the right password', async () => {
      const res = await login({ username: 'admin', password: 'Secret123' });

      assert.equal(res.status, 200);
      assert.equal(typeof res.body.token, 'string');
      assert.equal(res.body.user.username, 'admin');
      assert.equal(res.body.user.role, 'admin');
    });

    it('refuses a wrong password', async () => {
      const res = await login({ username: 'admin', password: 'wrong' });

      assert.equal(res.status, 401);
    });

    it('refuses a user that does not exist', async () => {
      const res = await login({ username: 'nobody', password: 'Secret123' });

      assert.equal(res.status, 401);
    });

    it('switches to the chosen language', async () => {
      const res = await login({ username: 'admin', password: 'Secret123', language: 'nl' });

      assert.equal(res.body.user.language, 'nl');
      assert.equal((await User.findById(admin._id)).language, 'nl');
    });

    it('ignores a language that does not exist', async () => {
      const res = await login({ username: 'admin', password: 'Secret123', language: 'xx' });

      assert.equal(res.body.user.language, 'en');
    });

    it('never stores the password as plain text', async () => {
      const stored = await User.findById(admin._id);

      assert.notEqual(stored.password, 'Secret123');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the logged in user', async () => {
      const res = await asAdmin(request(app).get('/api/auth/me'));

      assert.equal(res.status, 200);
      assert.equal(res.body.username, 'admin');
    });

    it('refuses a request without a token', async () => {
      const res = await request(app).get('/api/auth/me');

      assert.equal(res.status, 401);
    });

    it('refuses a token that is not valid', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-token');

      assert.equal(res.status, 401);
    });

    it('refuses the token of a user who has been deleted', async () => {
      await User.findByIdAndDelete(admin._id);
      const res = await asAdmin(request(app).get('/api/auth/me'));

      assert.equal(res.status, 401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('lets an admin create a user', async () => {
      const res = await asAdmin(request(app).post('/api/auth/register')).send({
        username: 'maria',
        password: 'Secret123',
        role: 'member',
        language: 'fr'
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.username, 'maria');
      assert.equal(res.body.user.language, 'fr');
    });

    it('refuses a username that is taken', async () => {
      const res = await asAdmin(request(app).post('/api/auth/register')).send({
        username: 'admin',
        password: 'Secret123'
      });

      assert.equal(res.status, 400);
    });

    it('refuses members who are not admins', async () => {
      const member = await createUser('maria', 'member');
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${tokenFor(member)}`)
        .send({ username: 'sneaky', password: 'Secret123', role: 'admin' });

      assert.equal(res.status, 403);
      assert.equal(await User.findOne({ username: 'sneaky' }), null);
    });
  });

  describe('users list and delete', () => {
    it('lists users without their passwords', async () => {
      const res = await asAdmin(request(app).get('/api/auth/users'));

      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.ok(!JSON.stringify(res.body).includes('password'));
    });

    it('refuses members who are not admins', async () => {
      const member = await createUser('maria', 'member');
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${tokenFor(member)}`);

      assert.equal(res.status, 403);
    });

    it('lets an admin delete a user', async () => {
      const maria = await createUser('maria', 'member');
      const res = await asAdmin(request(app).delete(`/api/auth/users/${maria._id}`));

      assert.equal(res.status, 200);
      assert.equal(await User.findById(maria._id), null);
    });

    it('answers 404 for a user that does not exist', async () => {
      const unknownId = new mongoose.Types.ObjectId();
      const res = await asAdmin(request(app).delete(`/api/auth/users/${unknownId}`));

      assert.equal(res.status, 404);
    });
  });
});