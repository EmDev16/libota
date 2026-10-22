// Ended relationships (formerSpouses): kept in step on both partners, in export and import.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');

describe('partners and ended relationships', () => {
  let admin;
  let token;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    admin = await createUser('admin', 'admin');
    token = tokenFor(admin);
  });

  const as = (req) => req.set('Authorization', `Bearer ${token}`);
  const create = async (firstName, extra = {}) => {
    const res = await as(request(app).post('/api/person')).send({
      firstName,
      lastName: 'Test',
      gender: 'male',
      ...extra
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body._id;
  };
  const update = (id, body) => as(request(app).put(`/api/person/${id}`)).send(body);
  const load = (id) => Person.findById(id).lean();
  const ids = (list) => list.map(String);

  it('marks an ended relationship on both people when a person is created', async () => {
    const carine = await create('Carine', { gender: 'female' });
    const jean = await create('Jean', { spouses: [carine], formerSpouses: [carine] });

    assert.deepEqual(ids((await load(jean)).formerSpouses), [carine]);
    assert.deepEqual(ids((await load(carine)).formerSpouses), [jean]);
    assert.deepEqual(ids((await load(carine)).spouses), [jean]);
  });

  it('keeps a relationship current when it is not marked as ended', async () => {
    const rose = await create('Rose');
    const jean = await create('Jean', { spouses: [rose] });

    assert.deepEqual((await load(jean)).formerSpouses, []);
    assert.deepEqual((await load(rose)).formerSpouses, []);
  });

  it('keeps the order of the partners as the form sends it', async () => {
    const a = await create('A');
    const b = await create('B');
    const c = await create('C');
    const jean = await create('Jean', { spouses: [c, a, b] });

    assert.deepEqual(ids((await load(jean)).spouses), [c, a, b]);

    await update(jean, { spouses: [b, c, a] });
    assert.deepEqual(ids((await load(jean)).spouses), [b, c, a]);
  });

  it('marks and un-marks the end of a relationship on both people when editing', async () => {
    const carine = await create('Carine');
    const jean = await create('Jean', { spouses: [carine] });

    await update(jean, { spouses: [carine], formerSpouses: [carine] });
    assert.deepEqual(ids((await load(carine)).formerSpouses), [jean]);

    await update(jean, { spouses: [carine], formerSpouses: [] });
    assert.deepEqual((await load(jean)).formerSpouses, []);
    assert.deepEqual((await load(carine)).formerSpouses, []);
  });

  it('keeps the ended relationships when the form does not send them', async () => {
    const carine = await create('Carine');
    const jean = await create('Jean', { spouses: [carine], formerSpouses: [carine] });

    await update(jean, { firstName: 'Jean-Paul', spouses: [carine] });

    assert.deepEqual(ids((await load(jean)).formerSpouses), [carine]);
    assert.deepEqual(ids((await load(carine)).formerSpouses), [jean]);
  });

  it('only accepts partners as ended relationships', async () => {
    const stranger = await create('Stranger');
    const jean = await create('Jean', { formerSpouses: [stranger] });

    assert.deepEqual((await load(jean)).formerSpouses, []);
    assert.deepEqual((await load(stranger)).formerSpouses, []);
  });

  it('forgets the ended relationship when the partner is removed', async () => {
    const carine = await create('Carine');
    const jean = await create('Jean', { spouses: [carine], formerSpouses: [carine] });

    await update(jean, { spouses: [], formerSpouses: [carine] });

    assert.deepEqual((await load(jean)).formerSpouses, []);
    assert.deepEqual((await load(carine)).spouses, []);
    assert.deepEqual((await load(carine)).formerSpouses, []);
  });

  it('forgets the ended relationship when a person is deleted', async () => {
    const carine = await create('Carine');
    const jean = await create('Jean', { spouses: [carine], formerSpouses: [carine] });

    const res = await as(request(app).delete(`/api/person/${jean}`));

    assert.equal(res.status, 200);
    assert.deepEqual((await load(carine)).spouses, []);
    assert.deepEqual((await load(carine)).formerSpouses, []);
  });

  describe('export and import', () => {
    it('exports the ended relationships', async () => {
      const carine = await create('Carine');
      const jean = await create('Jean', { spouses: [carine], formerSpouses: [carine] });

      const res = await as(request(app).get('/api/export/json'));
      const exported = res.body.people.find((p) => p._id === jean);

      assert.deepEqual(exported.formerSpouses, [carine]);
    });

    it('imports them, with the partners in the order of the file', async () => {
      const file = {
        people: [
          { _id: 'j', firstName: 'Jean', lastName: 'T', gender: 'male', spouses: ['r', 'c'], formerSpouses: ['c'] },
          { _id: 'c', firstName: 'Carine', lastName: 'T', gender: 'female', spouses: ['j'] },
          { _id: 'r', firstName: 'Rose', lastName: 'T', gender: 'female', spouses: ['j'] }
        ]
      };
      const res = await as(request(app).post('/api/export/json')).send({ data: file, mode: 'add' });
      assert.equal(res.status, 200, JSON.stringify(res.body));

      const jean = await Person.findOne({ firstName: 'Jean' }).lean();
      const carine = await Person.findOne({ firstName: 'Carine' }).lean();
      const rose = await Person.findOne({ firstName: 'Rose' }).lean();

      assert.deepEqual(ids(jean.spouses), [String(rose._id), String(carine._id)]);
      assert.deepEqual(ids(jean.formerSpouses), [String(carine._id)]);
      assert.deepEqual(ids(carine.formerSpouses), [String(jean._id)]);
      assert.deepEqual(rose.formerSpouses, []);
    });

    it('ignores an ended relationship between people who are not partners', async () => {
      const file = {
        people: [
          { _id: 'a', firstName: 'A', lastName: 'T', gender: 'male', formerSpouses: ['b'] },
          { _id: 'b', firstName: 'B', lastName: 'T', gender: 'female' }
        ]
      };
      await as(request(app).post('/api/export/json')).send({ data: file, mode: 'add' });

      const a = await Person.findOne({ firstName: 'A' }).lean();
      assert.deepEqual(a.formerSpouses, []);
    });
  });
});