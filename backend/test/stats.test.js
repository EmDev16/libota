// The dashboard numbers, and the route that serves them.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { computeStats } = require('../utils/stats');

const person = (id, extra = {}) => ({
  _id: id,
  firstName: `P${id}`,
  lastName: 'Test',
  parents: [],
  spouses: [],
  ...extra
});

describe('computeStats', () => {
  const today = '2026-10-22';

  it('counts living, deceased and couples (each couple once)', () => {
    const stats = computeStats(
      [
        person('a', { spouses: ['b'] }),
        person('b', { spouses: ['a'] }),
        person('c', { deathDate: '1990-01-01' })
      ],
      { today }
    );
    assert.equal(stats.total, 3);
    assert.equal(stats.living, 2);
    assert.equal(stats.deceased, 1);
    assert.equal(stats.couples, 1);
  });

  it('puts partners in the same generation and finds the largest one', () => {
    const stats = computeStats(
      [
        person('g1', { spouses: ['g1w'] }),
        person('g1w', { spouses: ['g1'] }),
        person('k1', { parents: ['g1', 'g1w'], spouses: ['k1w'] }),
        person('k1w', { spouses: ['k1'] }),
        person('k2', { parents: ['g1', 'g1w'] }),
        person('k3', { parents: ['g1', 'g1w'] }),
        person('gk', { parents: ['k1', 'k1w'] })
      ],
      { today }
    );
    assert.deepEqual(stats.generationSizes, [2, 4, 1]);
    assert.equal(stats.generations, 3);
    assert.deepEqual(stats.largestGeneration, { number: 2, size: 4 });
  });

  it('does not hang on a loop in the data', () => {
    const stats = computeStats(
      [person('a', { parents: ['b'] }), person('b', { parents: ['a'] })],
      { today }
    );
    assert.equal(stats.total, 2);
  });

  it('averages the age of the living family, only for people with a birth date', () => {
    const stats = computeStats(
      [
        person('a', { birthDate: '1990-06-01' }), // 36 on the test date
        person('b', { birthDate: '1960-06-01' }), // 66
        person('c', {}), // no birth date: ignored
        person('d', { birthDate: '1900-01-01', deathDate: '1980-01-01' }) // deceased: ignored
      ],
      { today }
    );
    assert.equal(stats.ageSample, 2);
    assert.equal(stats.averageAge, (stats.oldestLiving.age + stats.youngestLiving.age) / 2);
  });

  it('averages the age at death, only for people with both dates', () => {
    const stats = computeStats(
      [
        person('a', { birthDate: '1900-06-01', deathDate: '1980-06-01' }), // 80
        person('b', { birthDate: '1910-06-01', deathDate: '1960-05-31' }), // 49
        person('c', { deathDate: '1950-01-01' }) // no birth date: ignored
      ],
      { today }
    );
    assert.equal(stats.averageLifespan, 64.5);
    assert.equal(stats.lifespanSample, 2);
  });

  it('finds the oldest and youngest living person', () => {
    const stats = computeStats(
      [
        person('a', { birthDate: '1950-10-23' }),
        person('b', { birthDate: '2020-01-01' }),
        person('c', { birthDate: '1930-01-01', deathDate: '2000-01-01' })
      ],
      { today }
    );
    assert.equal(stats.oldestLiving.age, 75); // birthday is tomorrow
    assert.equal(stats.youngestLiving.age, 6);
  });

  it('lists the most common names, only names that appear twice or more', () => {
    const stats = computeStats(
      [
        person('a', { firstName: 'Marie', lastName: 'Kabila' }),
        person('b', { firstName: 'marie', lastName: 'Kabila' }),
        person('c', { firstName: 'Paul', lastName: 'Mbala' })
      ],
      { today }
    );
    assert.deepEqual(stats.topFirstNames, [{ name: 'Marie', count: 2 }]);
    assert.deepEqual(stats.topLastNames, [{ name: 'Kabila', count: 2 }]);
  });

  it('counts births per decade with a running total, also for empty decades', () => {
    const stats = computeStats(
      [
        person('a', { birthDate: '1951-01-01' }),
        person('b', { birthDate: '1959-01-01' }),
        person('c', { birthDate: '1982-01-01' })
      ],
      { today }
    );
    assert.deepEqual(stats.growth, [
      { decade: 1950, born: 2, total: 2 },
      { decade: 1960, born: 0, total: 2 },
      { decade: 1970, born: 0, total: 2 },
      { decade: 1980, born: 1, total: 3 }
    ]);
  });

  describe('birthdays', () => {
    const names = (stats) => stats.birthdays.map((b) => b.name);

    it('lists living people in the next 30 days, soonest first, with the age they turn', () => {
      const stats = computeStats(
        [
          person('a', { firstName: 'Today', birthDate: '2000-10-22' }),
          person('b', { firstName: 'Soon', birthDate: '1990-11-05' }),
          person('c', { firstName: 'Late', birthDate: '1990-12-31' }),
          person('d', { firstName: 'Dead', birthDate: '1990-10-25', deathDate: '2020-01-01' })
        ],
        { today }
      );
      assert.deepEqual(names(stats), ['Today Test', 'Soon Test']);
      assert.deepEqual(
        stats.birthdays.map((b) => [b.daysAway, b.turns, b.day, b.month]),
        [
          [0, 26, 22, 10],
          [14, 36, 5, 11]
        ]
      );
    });

    it('looks across the new year', () => {
      const stats = computeStats([person('a', { birthDate: '1980-01-03' })], { today: '2026-12-28' });
      assert.equal(stats.birthdays[0].daysAway, 6);
      assert.equal(stats.birthdays[0].turns, 47);
    });

    it('moves 29 February to 28 February in other years', () => {
      const stats = computeStats([person('a', { birthDate: '2000-02-29' })], { today: '2027-02-20' });
      assert.equal(stats.birthdays[0].daysAway, 8);
    });

    it('leaves out people without a birth date', () => {
      assert.deepEqual(computeStats([person('a')], { today }).birthdays, []);
    });
  });

  it('finds births and deaths on this day in earlier years', () => {
    const stats = computeStats(
      [
        person('a', { firstName: 'Born', birthDate: '1950-10-22' }),
        person('b', { firstName: 'Died', birthDate: '1920-01-01', deathDate: '1999-10-22' }),
        person('c', { firstName: 'Today', birthDate: '2026-10-22' })
      ],
      { today }
    );
    assert.deepEqual(
      stats.onThisDay.map((e) => [e.kind, e.year]),
      [
        ['born', 1950],
        ['died', 1999]
      ]
    );
  });

  it('copes with an empty family', () => {
    const stats = computeStats([], { today });
    assert.equal(stats.total, 0);
    assert.equal(stats.averageLifespan, null);
    assert.equal(stats.averageAge, null);
    assert.equal(stats.largestGeneration, null);
    assert.deepEqual(stats.growth, []);
  });
});

// One database for everything below: the helpers share a temporary folder that is removed by
// stopDb, so stopDb must only run once per test file.
const { startDb, stopDb, clearDb, createUser, createPerson, tokenFor } = require('./helpers');
const app = require('../app');
const User = require('../models/User');

describe('statistics access', () => {
  let admin;
  let member;
  let token;

  before(startDb);
  after(stopDb);
  beforeEach(async () => {
    await clearDb();
    admin = await createUser('boss', 'admin');
    member = await createUser('maria', 'member');
    token = tokenFor(member);
  });

  describe('GET /api/person/stats', () => {
    it('needs a login', async () => {
      assert.equal((await request(app).get('/api/person/stats')).status, 401);
    });

    it('refuses a member who was not given statistics', async () => {
      const res = await request(app).get('/api/person/stats').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 403);
    });

    it('gives a member the numbers once an admin allowed it (and is not mistaken for a person id)', async () => {
      await User.updateOne({ _id: member._id }, { showStats: true });
      await createPerson(member, { firstName: 'Ruth', birthDate: '2000-10-25' });
      const res = await request(app)
        .get('/api/person/stats?today=2026-10-22')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.birthdays[0].daysAway, 3);
    });

    it('always gives an admin the numbers', async () => {
      const res = await request(app)
        .get('/api/person/stats')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      assert.equal(res.status, 200);
    });

    it('ignores a made-up "today"', async () => {
      await User.updateOne({ _id: member._id }, { showStats: true });
      const res = await request(app)
        .get('/api/person/stats?today=nonsense')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.match(res.body.today, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('the switch for an account', () => {
    const put = (t, id, body) =>
      request(app).put(`/api/auth/users/${id}/stats`).set('Authorization', `Bearer ${t}`).send(body);

    it('is off for a new member account and shown by /me', async () => {
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor(member)}`);
      assert.equal(me.body.showStats, false);
      const meAdmin = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor(admin)}`);
      assert.equal(meAdmin.body.showStats, true);
    });

    it('can be switched by an admin only', async () => {
      assert.equal((await put(tokenFor(member), member._id, { showStats: true })).status, 403);
      const res = await put(tokenFor(admin), member._id, { showStats: true });
      assert.equal(res.status, 200);
      assert.equal((await User.findById(member._id)).showStats, true);
    });

    it('refuses anything but true or false', async () => {
      assert.equal((await put(tokenFor(admin), member._id, { showStats: 'yes' })).status, 400);
    });

    it('can be set when an admin creates an account', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ username: 'paul', password: 'Secret123', role: 'member', showStats: true });
      assert.equal(res.status, 201);
      assert.equal((await User.findOne({ username: 'paul' })).showStats, true);
    });
  });
});
