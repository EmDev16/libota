// Members can look at the family, only admins can add or change people.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');

describe('person permissions', () => {
  let adminToken;
  let memberToken;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    adminToken = tokenFor(await createUser('admin', 'admin'));
    memberToken = tokenFor(await createUser('maria', 'member'));
  });

  const as = (token, req) => req.set('Authorization', `Bearer ${token}`);

  it('lets a member read the people', async () => {
    const res = await as(memberToken, request(app).get('/api/person'));
    assert.equal(res.status, 200);
  });

  it('refuses a member who adds a person', async () => {
    const res = await as(memberToken, request(app).post('/api/person')).send({
      firstName: 'Ruth',
      lastName: 'K',
      gender: 'female'
    });
    assert.equal(res.status, 403);
    assert.equal(await Person.countDocuments(), 0);
  });

  it('lets an admin add a person, and refuses a member who edits or deletes it', async () => {
    const created = await as(adminToken, request(app).post('/api/person')).send({
      firstName: 'Ruth',
      lastName: 'K',
      gender: 'female'
    });
    assert.equal(created.status, 201);

    const id = created.body._id;
    const edit = await as(memberToken, request(app).put(`/api/person/${id}`)).send({ firstName: 'Changed' });
    assert.equal(edit.status, 403);
    const del = await as(memberToken, request(app).delete(`/api/person/${id}`));
    assert.equal(del.status, 403);
    assert.equal((await Person.findById(id)).firstName, 'Ruth');
  });
});