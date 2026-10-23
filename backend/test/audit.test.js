// The activity log: what gets written, who can read it, and restoring a person.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');
const AuditLog = require('../models/AuditLog');

describe('activity log', () => {
  let admin;
  let adminToken;
  let memberToken;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    admin = await createUser('admin', 'admin');
    adminToken = tokenFor(admin);
    memberToken = tokenFor(await createUser('maria', 'member'));
  });

  const as = (token, req) => req.set('Authorization', `Bearer ${token}`);
  const addPerson = async (body) => {
    const res = await as(adminToken, request(app).post('/api/person')).send({ gender: 'female', ...body });
    assert.equal(res.status, 201);
    return res.body;
  };

  it('writes who, what, when and the result for a login', async () => {
    await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Secret123' });
    await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-one' });

    const entries = await AuditLog.find({ action: 'auth.login' }).sort({ createdAt: 1 });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].status, 'success');
    assert.equal(entries[0].username, 'admin');
    assert.equal(String(entries[0].userId), String(admin._id));
    assert.ok(entries[0].createdAt instanceof Date);
    assert.ok(entries[0].ip);
    assert.equal(entries[1].status, 'fail');
    assert.equal(entries[1].username, 'admin');
  });

  it('never stores a password', async () => {
    await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-one' });
    const text = JSON.stringify(await AuditLog.find().lean());
    assert.ok(!text.includes('wrong-one'));
    assert.ok(!text.includes('Secret123'));
  });

  it('logs adding, editing and deleting a person', async () => {
    const person = await addPerson({ firstName: 'Ruth', lastName: 'K' });
    await as(adminToken, request(app).put(`/api/person/${person._id}`)).send({ firstName: 'Ruthie' });
    await as(adminToken, request(app).delete(`/api/person/${person._id}`));

    const actions = (await AuditLog.find({ action: /^person\./ }).sort({ createdAt: 1 })).map((e) => e.action);
    assert.deepEqual(actions, ['person.create', 'person.update', 'person.delete']);
  });

  it('logs a failed change', async () => {
    const res = await as(adminToken, request(app).delete('/api/person/64b000000000000000000000'));
    assert.equal(res.status, 404);
    const entry = await AuditLog.findOne({ action: 'person.delete' });
    assert.equal(entry.status, 'fail');
  });

  it('lets only an admin read the log', async () => {
    assert.equal((await as(memberToken, request(app).get('/api/audit'))).status, 403);
    assert.equal((await request(app).get('/api/audit')).status, 401);
    await addPerson({ firstName: 'Ruth', lastName: 'K' });
    const res = await as(adminToken, request(app).get('/api/audit?action=person.create'));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.entries[0].targetName, 'Ruth K');
  });

  it('shows what an edit changed', async () => {
    const person = await addPerson({ firstName: 'Ruth', lastName: 'K', birthDate: '1950-03-04' });
    await as(adminToken, request(app).put(`/api/person/${person._id}`)).send({ firstName: 'Ruthie', birthDate: '1950-03-05' });
    const res = await as(adminToken, request(app).get('/api/audit?action=person.update'));
    const changes = res.body.entries[0].changes;
    assert.deepEqual(changes.map((c) => c.field).sort(), ['birthDate', 'firstName']);
    assert.equal(changes.find((c) => c.field === 'birthDate').to, '05/03/1950');
  });

  it('restores the values from before an edit', async () => {
    const person = await addPerson({ firstName: 'Ruth', lastName: 'K', description: 'old' });
    await as(adminToken, request(app).put(`/api/person/${person._id}`)).send({ firstName: 'Mistake', description: 'new' });
    const entry = await AuditLog.findOne({ action: 'person.update' });

    const res = await as(adminToken, request(app).post(`/api/audit/${entry._id}/restore`));
    assert.equal(res.status, 200);
    const back = await Person.findById(person._id);
    assert.equal(back.firstName, 'Ruth');
    assert.equal(back.description, 'old');

    // the same entry cannot be restored twice, and the restore itself is in the log
    assert.equal((await as(adminToken, request(app).post(`/api/audit/${entry._id}/restore`))).status, 409);
    assert.equal(await AuditLog.countDocuments({ action: 'person.update' }), 2);
  });

  it('brings a deleted person back with the family links', async () => {
    const parent = await addPerson({ firstName: 'Papa', lastName: 'K', gender: 'male' });
    const child = await addPerson({ firstName: 'Ruth', lastName: 'K', parents: JSON.stringify([parent._id]) });
    assert.equal((await Person.findById(parent._id)).children.length, 1);

    await as(adminToken, request(app).delete(`/api/person/${child._id}`));
    assert.equal((await Person.findById(parent._id)).children.length, 0);

    const entry = await AuditLog.findOne({ action: 'person.delete' });
    const res = await as(adminToken, request(app).post(`/api/audit/${entry._id}/restore`));
    assert.equal(res.status, 200);

    const back = await Person.findById(child._id);
    assert.equal(back.firstName, 'Ruth');
    assert.deepEqual(back.parents.map(String), [parent._id]);
    assert.deepEqual((await Person.findById(parent._id)).children.map(String), [child._id]);
  });

  it('undoes adding a person', async () => {
    const person = await addPerson({ firstName: 'Oops', lastName: 'K' });
    const entry = await AuditLog.findOne({ action: 'person.create' });
    assert.equal((await as(adminToken, request(app).post(`/api/audit/${entry._id}/restore`))).status, 200);
    assert.equal(await Person.findById(person._id), null);
  });

  it('refuses to restore a failed entry or for a member', async () => {
    await as(adminToken, request(app).delete('/api/person/64b000000000000000000000'));
    const failed = await AuditLog.findOne({ status: 'fail' });
    assert.equal((await as(adminToken, request(app).post(`/api/audit/${failed._id}/restore`))).status, 400);
    assert.equal((await as(memberToken, request(app).post(`/api/audit/${failed._id}/restore`))).status, 403);
  });
});
