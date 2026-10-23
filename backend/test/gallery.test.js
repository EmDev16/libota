// The gallery: who can add photos, how the details are cleaned, and photos suggested by members.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { startDb, stopDb, clearDb, createUser, tokenFor } = require('./helpers');
const app = require('../app');
const GalleryPhoto = require('../models/GalleryPhoto');
const SuggestionRequest = require('../models/SuggestionRequest');

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
});
