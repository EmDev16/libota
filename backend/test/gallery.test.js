// The gallery: who can add photos, how the details are cleaned, and photos suggested by members.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const GalleryPhoto = require('../models/GalleryPhoto');
const SuggestionRequest = require('../models/SuggestionRequest');
const User = require('../models/User');
const { createPerson } = require('./helpers');

// A real 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64'
);

describe('gallery', () => {
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
  const upload = (token, items, count = items.length) => {
    let req = as(token, request(app).post('/api/gallery')).field('items', JSON.stringify(items));
    for (let i = 0; i < count; i += 1) req = req.attach('photos', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
    return req;
  };

  it('lets an admin add photos and everyone read them', async () => {
    const res = await upload(adminToken, [
      { caption: 'Wedding', year: 2018, album: 'Weddings', tags: ['#Wedding', ' Family  Gathering 2018 ', 'wedding'], width: 4000, height: 3000 },
      { date: '2019-12-25', width: 3000, height: 4000 }
    ]);
    assert.equal(res.status, 201);
    assert.equal(res.body.length, 2);
    // tags are cleaned: no #, lower case, no doubles
    assert.deepEqual(res.body[0].tags, ['wedding', 'family gathering 2018']);
    assert.equal(res.body[1].year, 2019);

    const list = await as(memberToken, request(app).get('/api/gallery'));
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);
    assert.equal(list.body[0].date, '2019-12-25'); // newest first
    assert.ok(list.body[0].image.startsWith('/uploads/'));
  });

  it('filters by album, tag and year', async () => {
    await upload(adminToken, [
      { album: 'Weddings', year: 2018, tags: ['wedding'] },
      { album: 'Christmas', year: 2019, tags: ['christmas'] }
    ]);
    const get = async (q) => (await as(memberToken, request(app).get(`/api/gallery?${q}`))).body.length;
    assert.equal(await get('album=Weddings'), 1);
    assert.equal(await get('tag=%23Christmas'), 1);
    assert.equal(await get('year=2019'), 1);
    assert.equal(await get('year=2020'), 0);
  });

  it('refuses members and visitors who add, change or delete', async () => {
    const res = await upload(adminToken, [{ caption: 'x' }]);
    const id = res.body[0].id;
    assert.equal((await upload(memberToken, [{}])).status, 403);
    assert.equal((await request(app).get('/api/gallery')).status, 401);
    assert.equal((await as(memberToken, request(app).put(`/api/gallery/${id}`)).send({ caption: 'hack' })).status, 403);
    assert.equal((await as(memberToken, request(app).delete(`/api/gallery/${id}`))).status, 403);
    assert.equal((await GalleryPhoto.findById(id)).caption, 'x');
  });

  it('refuses bad details and files that are not images', async () => {
    assert.equal((await upload(adminToken, [{ year: 1500 }])).status, 400);
    assert.equal((await upload(adminToken, [{ date: 'yesterday' }])).status, 400);
    assert.equal((await upload(adminToken, [{ tags: 'not-a-list' }])).status, 400);
    assert.equal((await upload(adminToken, [{ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }])).status, 400);
    assert.equal((await upload(adminToken, [], 0)).status, 400);
    const text = await as(adminToken, request(app).post('/api/gallery'))
      .field('items', '[{}]')
      .attach('photos', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    assert.equal(text.status, 400);
    assert.equal(await GalleryPhoto.countDocuments(), 0);
  });

  it('changes and deletes a photo', async () => {
    const created = await upload(adminToken, [{ caption: 'Old', year: 2000, tags: ['a'] }]);
    const id = created.body[0].id;
    const put = await as(adminToken, request(app).put(`/api/gallery/${id}`)).send({ caption: 'New', album: 'Trip', tags: ['b'], year: 2001 });
    assert.equal(put.status, 200);
    assert.equal(put.body.caption, 'New');
    assert.equal(put.body.year, 2001);
    assert.deepEqual(put.body.tags, ['b']);

    assert.equal((await as(adminToken, request(app).delete(`/api/gallery/${id}`))).status, 200);
    assert.equal(await GalleryPhoto.countDocuments(), 0);
    assert.equal((await as(adminToken, request(app).delete(`/api/gallery/${id}`))).status, 404);
  });

  it('puts an approved member suggestion in the gallery', async () => {
    const sent = await as(memberToken, request(app).post('/api/requests'))
      .field('senderName', 'Marie')
      .field('items', JSON.stringify([{ type: 'photo', gallery: { caption: 'Grandma', year: 1975, album: 'Old', tags: ['#Family'], width: 800, height: 600 } }]))
      .attach('photo_0', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(sent.status, 201);
    assert.equal(await GalleryPhoto.countDocuments(), 0); // nothing yet

    const stored = await SuggestionRequest.findOne();
    const res = await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/approve`));
    assert.equal(res.status, 200);
    const photo = await GalleryPhoto.findOne();
    assert.equal(photo.caption, 'Grandma');
    assert.equal(photo.takenYear, 1975);
    assert.deepEqual(photo.tags, ['family']);
    assert.ok(photo.image);
  });

  it('refuses a photo suggestion without a photo', async () => {
    const res = await as(memberToken, request(app).post('/api/requests'))
      .field('items', JSON.stringify([{ type: 'photo', gallery: { caption: 'x' } }]));
    assert.equal(res.status, 400);
  });
  describe('hidden tags', () => {
    const list = async (token, q = '') => (await as(token, request(app).get(`/api/gallery${q}`))).body;

    beforeEach(async () => {
      await upload(adminToken, [
        { caption: 'open' },
        { caption: 'mbala only', hiddenTags: ['#Mbala'] },
        { caption: 'other family', hiddenTags: ['kabila'] },
        { caption: 'timeline open', hiddenTags: ['timeline'], year: 2001 },
        { caption: 'timeline and mbala', hiddenTags: ['timeline', 'mbala'], year: 2002 }
      ]);
    });

    it('shows a member only open photos by default', async () => {
      const names = (await list(memberToken)).map((p) => p.caption).sort();
      assert.deepEqual(names, ['open', 'timeline open']);
    });

    it('shows photos with a hidden tag the account has', async () => {
      await User.updateOne({ username: 'maria' }, { galleryTags: ['mbala'] });
      const names = (await list(memberToken)).map((p) => p.caption).sort();
      assert.deepEqual(names, ['mbala only', 'open', 'timeline and mbala', 'timeline open']);
    });

    it('shows everything to a member with all photos, and to an admin', async () => {
      await User.updateOne({ username: 'maria' }, { galleryAll: true });
      assert.equal((await list(memberToken)).length, 5);
      assert.equal((await list(adminToken)).length, 5);
    });

    it('only gives hidden tags to admins', async () => {
      const member = await list(memberToken);
      assert.ok(member.every((p) => p.hiddenTags === undefined));
      const adminList = await list(adminToken);
      assert.deepEqual(adminList.find((p) => p.caption === 'mbala only').hiddenTags, ['mbala']);
    });

    it('puts photos with the timeline tag on the timeline', async () => {
      const t = await list(adminToken, '?timeline=1');
      assert.deepEqual(t.map((p) => p.caption).sort(), ['timeline and mbala', 'timeline open']);
      assert.ok(t.every((p) => p.inTimeline));
      const memberT = await list(memberToken, '?timeline=1');
      assert.deepEqual(memberT.map((p) => p.caption), ['timeline open']);
    });

    it('does not let a member set hidden tags through a suggestion', async () => {
      const sent = await as(memberToken, request(app).post('/api/requests'))
        .field('items', JSON.stringify([{ type: 'photo', gallery: { caption: 'x', hiddenTags: ['mbala'] } }]))
        .attach('photo_0', PNG, { filename: 'a.png', contentType: 'image/png' });
      assert.equal(sent.status, 201);
      const stored = await SuggestionRequest.findOne();
      await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/approve`));
      const photo = await GalleryPhoto.findOne({ caption: 'x' });
      assert.deepEqual(photo.hiddenTags, []);
    });
  });

  describe('people on photos', () => {
    it('tags a family member and somebody outside the family, and creates nobody', async () => {
      const anna = await createPerson(admin._id);
      const before = await require('../models/Person').countDocuments();
      const res = await upload(adminToken, [
        { people: [{ personId: String(anna._id), name: 'ignored', x: 40, y: 30 }, { name: ' Uncle  Bob ', x: 70, y: 20 }, { name: 'Not placed' }] }
      ]);
      assert.equal(res.status, 201);
      const people = res.body[0].people;
      assert.equal(people[0].name, `${anna.firstName} ${anna.lastName}`);
      assert.equal(people[0].personId, String(anna._id));
      assert.equal(people[1].name, 'Uncle Bob');
      assert.equal(people[1].personId, null);
      assert.equal(people[2].x, null);
      assert.equal(await require('../models/Person').countDocuments(), before);
    });

    it('finds all photos of a person', async () => {
      const anna = await createPerson(admin._id);
      await upload(adminToken, [
        { caption: 'with anna', people: [{ personId: String(anna._id), x: 1, y: 1 }] },
        { caption: 'with bob', people: [{ name: 'Bob' }] },
        { caption: 'nobody' }
      ]);
      const byId = await as(memberToken, request(app).get(`/api/gallery?person=${anna._id}`));
      assert.deepEqual(byId.body.map((p) => p.caption), ['with anna']);
      const byName = await as(memberToken, request(app).get('/api/gallery?person=bob'));
      assert.deepEqual(byName.body.map((p) => p.caption), ['with bob']);
    });

    it('refuses bad people', async () => {
      assert.equal((await upload(adminToken, [{ people: [{ personId: '507f1f77bcf86cd799439011' }] }])).status, 400);
      assert.equal((await upload(adminToken, [{ people: [{ personId: 'nope' }] }])).status, 400);
      assert.equal((await upload(adminToken, [{ people: [{ name: '' }] }])).status, 400);
      assert.equal((await upload(adminToken, [{ people: [{ name: 'A', x: 150, y: 10 }] }])).status, 400);
      assert.equal((await upload(adminToken, [{ people: 'x' }])).status, 400);
    });

    it('keeps a member suggestion people list', async () => {
      await as(memberToken, request(app).post('/api/requests'))
        .field('items', JSON.stringify([{ type: 'photo', gallery: { people: [{ name: 'Cousin Jo' }] } }]))
        .attach('photo_0', PNG, { filename: 'a.png', contentType: 'image/png' });
      const stored = await SuggestionRequest.findOne();
      await as(adminToken, request(app).post(`/api/requests/${stored._id}/items/${stored.items[0]._id}/approve`));
      assert.equal((await GalleryPhoto.findOne()).people[0].name, 'Cousin Jo');
    });
  });

  describe('options and album names', () => {
    it('reuses an existing album whatever the capitals', async () => {
      await upload(adminToken, [{ album: 'Christmas 2019' }]);
      const res = await upload(adminToken, [{ album: 'christmas  2019' }]);
      assert.equal(res.body[0].album, 'Christmas 2019');
    });

    it('lists existing albums, tags and outside names; hidden tags for admins only and only what can be seen', async () => {
      await upload(adminToken, [
        { album: 'Trip', tags: ['sea'], people: [{ name: 'Bob' }] },
        { album: 'Secret', tags: ['hush'], hiddenTags: ['mbala', 'timeline'] }
      ]);
      const member = (await as(memberToken, request(app).get('/api/gallery/options'))).body;
      assert.deepEqual(member.albums, ['Trip']);
      assert.deepEqual(member.tags, ['sea']);
      assert.deepEqual(member.names, ['Bob']);
      assert.equal(member.hiddenTags, undefined);
      const adm = (await as(adminToken, request(app).get('/api/gallery/options'))).body;
      assert.deepEqual(adm.albums, ['Secret', 'Trip']);
      assert.deepEqual(adm.hiddenTags, ['mbala', 'timeline']);
    });
  });

  describe('gallery access of an account', () => {
    it('lets an admin set it, nobody else', async () => {
      const maria = await User.findOne({ username: 'maria' });
      const url = `/api/auth/users/${maria._id}/gallery`;
      const res = await as(adminToken, request(app).put(url)).send({ galleryAll: false, galleryTags: ['#Mbala', 'mbala', 'Kabila'] });
      assert.equal(res.status, 200);
      const stored = await User.findById(maria._id);
      assert.deepEqual(stored.galleryTags, ['mbala', 'kabila']);
      assert.equal((await as(memberToken, request(app).put(url)).send({ galleryAll: true, galleryTags: [] })).status, 403);
      assert.equal((await as(adminToken, request(app).put(url)).send({ galleryAll: 'yes', galleryTags: [] })).status, 400);
      assert.equal((await as(adminToken, request(app).put(url)).send({ galleryAll: true, galleryTags: 'x' })).status, 400);
    });
  });
});
