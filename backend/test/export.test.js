// Export and import of the family data. The import is the code that can delete data,
// so most of the tests are about what it keeps and what it refuses.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, createPerson, tokenFor } = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');
const User = require('../models/User');

// Anna and Ben are a couple with a daughter, Cleo (written like an export file)
const family = () => [
  { _id: 'a', firstName: 'Anna', lastName: 'Test', gender: 'female', spouses: ['b'], children: ['c'] },
  { _id: 'b', firstName: 'Ben', lastName: 'Test', gender: 'male', spouses: ['a'], children: ['c'] },
  {
    _id: 'c',
    firstName: 'Cleo',
    lastName: 'Test',
    gender: 'female',
    parents: ['a', 'b'],
    birthDate: '1990-05-01'
  }
];

describe('export and import', () => {
  let admin;
  let token;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    admin = await createUser('admin', 'admin');
    token = tokenFor(admin);
  });

  const authHeader = (t = token) => ({ Authorization: `Bearer ${t}` });
  const exportJson = (t = token) => request(app).get('/api/export/json').set(authHeader(t));
  const importJson = (body, t = token) =>
    request(app).post('/api/export/json').set(authHeader(t)).send(body);
  const personNames = async () => (await Person.find()).map((p) => p.firstName).sort();
  const byName = (name) => Person.findOne({ firstName: name });
  const strings = (list) => list.map(String).sort();

  // -------------------------------------------------------------------------
  describe('GET /api/export/json', () => {
    it('refuses visitors without a token', async () => {
      const res = await request(app).get('/api/export/json');

      assert.equal(res.status, 401);
    });

    it('refuses members who are not admins', async () => {
      const member = await createUser('maria', 'member');
      const res = await exportJson(tokenFor(member));

      assert.equal(res.status, 403);
    });

    it('exports people with string ids and relationships, and users without passwords', async () => {
      const anna = await createPerson(admin, { firstName: 'Anna' });
      const cleo = await createPerson(admin, { firstName: 'Cleo', parents: [anna._id] });
      await Person.updateOne({ _id: anna._id }, { children: [cleo._id] });

      const res = await exportJson();

      assert.equal(res.status, 200);
      assert.equal(res.body.version, '1.0');
      assert.equal(res.body.people.length, 2);

      const exportedCleo = res.body.people.find((p) => p.firstName === 'Cleo');
      assert.equal(typeof exportedCleo._id, 'string');
      assert.deepEqual(exportedCleo.parents, [String(anna._id)]);
      assert.equal(exportedCleo.createdBy, 'admin');

      assert.equal(res.body.users.length, 1);
      assert.ok(!JSON.stringify(res.body.users).includes('password'));
    });
  });

  describe('POST /api/export/json: who may import', () => {
    it('refuses visitors without a token and imports nothing', async () => {
      const res = await request(app).post('/api/export/json').send({ data: { people: family() } });

      assert.equal(res.status, 401);
      assert.equal(await Person.countDocuments(), 0);
    });

    it('refuses members who are not admins and imports nothing', async () => {
      const member = await createUser('maria', 'member');
      const res = await importJson({ data: { people: family() } }, tokenFor(member));

      assert.equal(res.status, 403);
      assert.equal(await Person.countDocuments(), 0);
    });
  });

  describe('POST /api/export/json: checking the file', () => {
    it('refuses a request without data', async () => {
      const res = await importJson({});

      assert.equal(res.status, 400);
    });

    it('refuses an empty list of people', async () => {
      const res = await importJson({ data: { people: [] } });

      assert.equal(res.status, 400);
    });

    it('refuses a mode that is not add or replace', async () => {
      const res = await importJson({ data: { people: family() }, mode: 'merge' });

      assert.equal(res.status, 400);
      assert.equal(await Person.countDocuments(), 0);
    });

    it('refuses a person without a first name', async () => {
      const people = [{ _id: 'x', lastName: 'Test', gender: 'male' }];
      const res = await importJson({ data: { people } });

      assert.equal(res.status, 400);
    });

    it('refuses a person that does not fit the Person model, and imports nobody', async () => {
      // the second person has no gender
      const people = [
        { _id: 'a', firstName: 'Anna', lastName: 'Test', gender: 'female' },
        { _id: 'b', firstName: 'Ben', lastName: 'Test' }
      ];
      const res = await importJson({ data: { people } });

      assert.equal(res.status, 400);
      assert.equal(await Person.countDocuments(), 0);
    });
  });

  describe('POST /api/export/json: add mode', () => {
    it('adds people and keeps everyone who is already there (also when no mode is given)', async () => {
      await createPerson(admin, { firstName: 'Old' });

      const res = await importJson({ data: { people: family() } });

      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 3);
      assert.deepEqual(await personNames(), ['Anna', 'Ben', 'Cleo', 'Old']);
    });

    it('rebuilds the relationships with the new database ids', async () => {
      await importJson({ data: { people: family() }, mode: 'add' });

      const anna = await byName('Anna');
      const ben = await byName('Ben');
      const cleo = await byName('Cleo');

      assert.deepEqual(strings(cleo.parents), strings([anna._id, ben._id]));
      assert.deepEqual(strings(anna.children), [String(cleo._id)]);
      assert.deepEqual(strings(anna.spouses), [String(ben._id)]);
      assert.deepEqual(strings(ben.spouses), [String(anna._id)]);
    });

    it('makes a link work both ways when the file only has one side of it', async () => {
      const people = [
        { _id: 'p', firstName: 'Parent', lastName: 'Test', gender: 'male' },
        { _id: 'k', firstName: 'Kid', lastName: 'Test', gender: 'female', parents: ['p'] }
      ];
      await importJson({ data: { people } });

      const parent = await byName('Parent');
      const kid = await byName('Kid');

      assert.deepEqual(strings(parent.children), [String(kid._id)]);
    });

    it('ignores links to people who are not in the file', async () => {
      const people = [
        { _id: 'k', firstName: 'Kid', lastName: 'Test', gender: 'female', parents: ['ghost'] }
      ];
      const res = await importJson({ data: { people } });

      assert.equal(res.status, 200);
      assert.equal((await byName('Kid')).parents.length, 0);
    });

    it('keeps the details of a person', async () => {
      await importJson({ data: { people: family() } });
      const cleo = await byName('Cleo');

      assert.equal(cleo.lastName, 'Test');
      assert.equal(cleo.gender, 'female');
      assert.equal(cleo.birthDate.toISOString().slice(0, 10), '1990-05-01');
    });

    it('credits the admin who imports as the creator', async () => {
      await importJson({ data: { people: family() } });

      assert.equal(String((await byName('Anna')).createdBy), String(admin._id));
    });

    it('credits the creator named in the file when that user exists', async () => {
      const maria = await createUser('maria', 'member');
      const people = [
        { _id: 'a', firstName: 'Anna', lastName: 'Test', gender: 'female', createdBy: 'maria' }
      ];
      await importJson({ data: { people } });

      assert.equal(String((await byName('Anna')).createdBy), String(maria._id));
    });

    it('does not create users from the file', async () => {
      const data = {
        people: family(),
        users: [{ username: 'newbie', role: 'member', language: 'fr' }]
      };
      await importJson({ data, mode: 'add' });

      assert.equal(await User.findOne({ username: 'newbie' }), null);
    });
  });

  describe('POST /api/export/json: replace mode', () => {
    it('replaces the existing people with the people in the file', async () => {
      await createPerson(admin, { firstName: 'Old' });

      const res = await importJson({ data: { people: family() }, mode: 'replace' });

      assert.equal(res.status, 200);
      assert.deepEqual(await personNames(), ['Anna', 'Ben', 'Cleo']);
    });

    it('never deletes users', async () => {
      await createUser('maria', 'member');

      await importJson({ data: { people: family() }, mode: 'replace' });

      assert.equal(await User.countDocuments(), 2);
      assert.ok(await User.findOne({ username: 'admin' }));
      assert.ok(await User.findOne({ username: 'maria' }));
    });

    it('re-creates users from the file that are missing, with the default password', async () => {
      const data = {
        people: family(),
        users: [{ username: 'newbie', role: 'member', language: 'fr' }]
      };
      const res = await importJson({ data, mode: 'replace' });

      assert.equal(res.body.usersImported, 1);
      const newbie = await User.findOne({ username: 'newbie' });
      assert.equal(newbie.language, 'fr');

      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: 'newbie', password: 'ChangeMe123' });
      assert.equal(login.status, 200);
    });

    it('does not change a user that already exists', async () => {
      const data = {
        people: family(),
        users: [{ username: 'admin', role: 'member', language: 'nl' }]
      };
      await importJson({ data, mode: 'replace' });

      assert.equal(await User.countDocuments(), 1);
      assert.equal((await User.findById(admin._id)).role, 'admin');
    });

    it('keeps the existing people when the file is refused', async () => {
      await createPerson(admin, { firstName: 'Old' });
      const people = [{ _id: 'a', firstName: 'Anna', lastName: 'Test' }]; // no gender

      const res = await importJson({ data: { people }, mode: 'replace' });

      assert.equal(res.status, 400);
      assert.deepEqual(await personNames(), ['Old']);
    });
  });

  describe('export, then import again', () => {
    it('restores the same family from an export (the backup use case)', async () => {
      const anna = await createPerson(admin, { firstName: 'Anna' });
      const ben = await createPerson(admin, { firstName: 'Ben', gender: 'male' });
      const cleo = await createPerson(admin, {
        firstName: 'Cleo',
        parents: [anna._id, ben._id],
        birthDate: '1990-05-01'
      });
      await Person.updateOne({ _id: anna._id }, { spouses: [ben._id], children: [cleo._id] });
      await Person.updateOne({ _id: ben._id }, { spouses: [anna._id], children: [cleo._id] });

      const backup = (await exportJson()).body;
      await Person.deleteMany({});
      const res = await importJson({ data: backup, mode: 'replace' });

      assert.equal(res.status, 200);
      assert.deepEqual(await personNames(), ['Anna', 'Ben', 'Cleo']);

      const restored = await Person.findOne({ firstName: 'Cleo' }).populate('parents');
      assert.deepEqual(restored.parents.map((p) => p.firstName).sort(), ['Anna', 'Ben']);
      assert.equal(restored.birthDate.toISOString().slice(0, 10), '1990-05-01');
      assert.equal(String(restored.createdBy), String(admin._id));
    });
  });
});