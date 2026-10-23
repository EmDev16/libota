// Suggestions from members, and the admin's answer.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, createPerson, tokenFor } = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');
const AuditLog = require('../models/AuditLog');
const SuggestionRequest = require('../models/SuggestionRequest');

describe('member suggestions', () => {
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
  const send = (token, items, extra = {}) =>
    as(token, request(app).post('/api/requests')).field('senderName', 'Marie').field('items', JSON.stringify(items)).field(...(extra.field || ['x', '1']));

  it('lets a member send several suggestions at once', async () => {
    const anna = await createPerson(admin);
    const res = await send(memberToken, [
      { type: 'correction', personId: String(anna._id), changes: { birthDate: '1950-03-04' } },
      { type: 'newPerson', newPerson: { firstName: 'Paul', lastName: 'K', gender: 'male' }, relation: 'her brother' },
      { type: 'me', newPerson: { firstName: 'Marie', lastName: 'K', gender: 'female' } }
    ]);
    assert.equal(res.status, 201);
    const saved = await SuggestionRequest.findOne();
    assert.equal(saved.items.length, 3);
    assert.equal(saved.senderName, 'Marie');
    assert.equal(saved.account, 'maria');
    assert.equal((await Person.findById(anna._id)).birthDate, null); // nothing changed yet
  });

  it('refuses admins, anonymous visitors and bad suggestions', async () => {
    const item = { type: 'newPerson', newPerson: { firstName: 'Paul', lastName: 'K', gender: 'male' } };
    assert.equal((await send(adminToken, [item])).status, 403);
    assert.equal((await request(app).post('/api/requests').send({})).status, 401);
    assert.equal((await send(memberToken, [{ type: 'newPerson', newPerson: { firstName: 'Paul' } }])).status, 400);
    assert.equal((await send(memberToken, [{ type: 'correction', personId: 'nope', changes: { firstName: 'X' } }])).status, 400);
    assert.equal((await send(memberToken, [{ type: 'correction', personId: String(admin._id), changes: {} }])).status, 400);
    assert.equal(await SuggestionRequest.countDocuments(), 0);
  });

  it('keeps requests away from members', async () => {
    assert.equal((await as(memberToken, request(app).get('/api/requests'))).status, 403);
    assert.equal((await as(memberToken, request(app).get('/api/requests/count'))).status, 403);
    assert.equal((await as(adminToken, request(app).get('/api/requests/mine'))).status, 403);
  });

  it('applies an approved correction and logs it so it can be restored', async () => {
    const anna = await createPerson(admin, { description: 'old' });
    await send(memberToken, [{ type: 'correction', personId: String(anna._id), changes: { description: 'new', birthDate: '1950-03-04' } }]);
    const stored = await SuggestionRequest.findOne();
    const count = await as(adminToken, request(app).get('/api/requests/count'));
    assert.equal(count.body.pending, 1);

    const res = await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/approve`));
    assert.equal(res.status, 200);
    const changed = await Person.findById(anna._id);
    assert.equal(changed.description, 'new');
    assert.equal(changed.birthDate.toISOString().slice(0, 10), '1950-03-04');
    assert.equal((await as(adminToken, request(app).get('/api/requests/count'))).body.pending, 0);

    const entry = await AuditLog.findOne({ action: 'person.update' });
    const undo = await as(adminToken, request(app).post(`/api/audit/${entry._id}/restore`));
    assert.equal(undo.status, 200);
    assert.equal((await Person.findById(anna._id)).description, 'old');

    // answering twice is refused
    const again = await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/approve`));
    assert.equal(again.status, 409);
  });

  it('adds an approved new person', async () => {
    await send(memberToken, [{ type: 'me', newPerson: { firstName: 'Marie', lastName: 'K', gender: 'female' } }]);
    const stored = await SuggestionRequest.findOne();
    const res = await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/approve`));
    assert.equal(res.status, 200);
    const person = await Person.findById(res.body.personId);
    assert.equal(person.firstName, 'Marie');
    assert.equal(String(person.createdBy), String(admin._id));
  });

  it('rejects a suggestion with a reason the member can read', async () => {
    await send(memberToken, [{ type: 'newPerson', newPerson: { firstName: 'Paul', lastName: 'K', gender: 'male' } }]);
    const stored = await SuggestionRequest.findOne();
    const res = await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/reject`)).send({ reason: 'Already in the tree' });
    assert.equal(res.status, 200);
    assert.equal(await Person.countDocuments(), 0);

    const mine = await as(memberToken, request(app).get('/api/requests/mine'));
    assert.equal(mine.body[0].items[0].status, 'rejected');
    assert.equal(mine.body[0].items[0].rejectReason, 'Already in the tree');
  });

  it('limits how many suggestions can wait', async () => {
    const item = { type: 'newPerson', newPerson: { firstName: 'Paul', lastName: 'K', gender: 'male' } };
    assert.equal((await send(memberToken, Array(10).fill(item))).status, 201);
    assert.equal((await send(memberToken, Array(10).fill(item))).status, 201);
    assert.equal((await send(memberToken, [item])).status, 429);
  });
});
