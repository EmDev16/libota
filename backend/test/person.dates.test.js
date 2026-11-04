// Unknown and approximate dates on the person routes.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');

describe('approximate and unknown dates', () => {
  let token;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    token = tokenFor(await createUser('admin', 'admin'));
  });

  const post = (fields) => {
    let req = request(app)
      .post('/api/person')
      .set('Authorization', `Bearer ${token}`)
      .field('firstName', 'Old')
      .field('lastName', 'Ancestor')
      .field('gender', 'male');
    Object.entries(fields).forEach(([k, v]) => (req = req.field(k, v)));
    return req;
  };
  const put = (id, fields) => {
    let req = request(app).put(`/api/person/${id}`).set('Authorization', `Bearer ${token}`);
    Object.entries(fields).forEach(([k, v]) => (req = req.field(k, v)));
    return req;
  };

  it('keeps a person as deceased when no date is known', async () => {
    const res = await post({ deceased: 'true' });
    assert.equal(res.status, 201);
    assert.equal(res.body.deceased, true);
    assert.equal(res.body.birthDate, null);
    assert.equal(res.body.deathDate, null);
  });

  it('keeps an approximate year, and forgets the flag when the date is removed', async () => {
    const res = await post({ birthDate: '1930-01-01', birthApprox: 'true', deceased: 'true' });
    assert.equal(res.body.birthApprox, true);

    const cleared = await put(res.body._id, { birthDate: '' });
    assert.equal(cleared.status, 200);
    assert.equal((await Person.findById(res.body._id)).birthApprox, false);
  });

  it('always marks a person with a death date as deceased', async () => {
    const res = await post({ deathDate: '1990-01-01', deathApprox: 'true' });
    assert.equal(res.body.deceased, true);
    assert.equal(res.body.deathApprox, true);
  });

  it('can say a person is living again', async () => {
    const res = await post({ deceased: 'true' });
    const back = await put(res.body._id, { deceased: 'false' });
    assert.equal(back.body.deceased, false);
  });

  it('does not touch the flags when an update does not mention them', async () => {
    const res = await post({ birthDate: '1930-01-01', birthApprox: 'true', deceased: 'true' });
    await put(res.body._id, { description: 'A note' });
    const saved = await Person.findById(res.body._id);
    assert.equal(saved.birthApprox, true);
    assert.equal(saved.deceased, true);
  });
});
