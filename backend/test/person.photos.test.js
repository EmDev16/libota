// Photos on the person routes: what is stored, what is cleaned up, who is refused.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const {
  startDb, stopDb, clearDb, createUser, createPerson, tokenFor, uploadsDir
} = require('./helpers');
const app = require('../app');
const Person = require('../models/Person');

const PNG = { filename: 'photo.png', contentType: 'image/png' };
const fileOf = (photo) => path.join(uploadsDir, path.basename(photo));
const filesInUploads = () => fs.readdirSync(uploadsDir);

describe('person photos', () => {
  let admin;
  let token;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await clearDb();
    admin = await createUser('admin', 'admin');
    token = tokenFor(admin);
  });

  const asUser = (req, t = token) => req.set('Authorization', `Bearer ${t}`);

  const createWithPhoto = (fields = {}, content = 'image-bytes') => {
    const req = asUser(request(app).post('/api/person'))
      .field('firstName', fields.firstName || 'Anna')
      .field('lastName', fields.lastName === undefined ? 'Test' : fields.lastName)
      .field('gender', 'female');
    return content === null ? req : req.attach('photo', Buffer.from(content), PNG);
  };

  describe('creating a person', () => {
    it('stores the photo and keeps its address on the person', async () => {
      const res = await createWithPhoto({}, 'image-bytes');

      assert.equal(res.status, 201);
      assert.match(res.body.photo, /^\/uploads\/[\w-]+\.png$/);
      assert.equal(fs.readFileSync(fileOf(res.body.photo), 'utf8'), 'image-bytes');
    });

    it('works without a photo', async () => {
      const res = await createWithPhoto({}, null);

      assert.equal(res.status, 201);
      assert.equal(res.body.photo, null);
      assert.deepEqual(filesInUploads(), []);
    });

    it('refuses a file that is not an image', async () => {
      const res = await asUser(request(app).post('/api/person'))
        .field('firstName', 'Anna')
        .field('lastName', 'Test')
        .field('gender', 'female')
        .attach('photo', Buffer.from('just text'), { filename: 'notes.txt', contentType: 'text/plain' });

      assert.equal(res.status, 400);
      assert.equal(await Person.countDocuments(), 0);
      assert.deepEqual(filesInUploads(), []);
    });

    it('leaves no photo behind when the person is invalid', async () => {
      const res = await createWithPhoto({ lastName: '' });

      assert.equal(res.status, 400);
      assert.equal(await Person.countDocuments(), 0);
      assert.deepEqual(filesInUploads(), []);
    });
  });

  describe('updating a person', () => {
    it('replaces the photo and removes the old file', async () => {
      const created = (await createWithPhoto({}, 'old-image')).body;

      const res = await asUser(request(app).put(`/api/person/${created._id}`))
        .field('firstName', 'Anna')
        .attach('photo', Buffer.from('new-image'), PNG);

      assert.equal(res.status, 200);
      assert.notEqual(res.body.photo, created.photo);
      assert.equal(fs.existsSync(fileOf(created.photo)), false);
      assert.equal(fs.readFileSync(fileOf(res.body.photo), 'utf8'), 'new-image');
    });

    it('keeps the photo when no new one is sent', async () => {
      const created = (await createWithPhoto({}, 'old-image')).body;

      const res = await asUser(request(app).put(`/api/person/${created._id}`)).field('firstName', 'Annabel');

      assert.equal(res.status, 200);
      assert.equal(res.body.firstName, 'Annabel');
      assert.equal(res.body.photo, created.photo);
      assert.ok(fs.existsSync(fileOf(created.photo)));
    });

    it('keeps the old file while another person still uses it', async () => {
      const shared = '/uploads/shared.png';
      fs.writeFileSync(path.join(uploadsDir, 'shared.png'), 'shared-image');
      const anna = await createPerson(admin, { firstName: 'Anna', photo: shared });
      await createPerson(admin, { firstName: 'Ben', photo: shared });

      await asUser(request(app).put(`/api/person/${anna._id}`))
        .field('firstName', 'Anna')
        .attach('photo', Buffer.from('new-image'), PNG);

      assert.ok(fs.existsSync(path.join(uploadsDir, 'shared.png')));
    });

    it('refuses a member who did not add the person, and stores nothing', async () => {
      const anna = await createPerson(admin, { firstName: 'Anna' });
      const maria = await createUser('maria', 'member');

      const res = await asUser(request(app).put(`/api/person/${anna._id}`), tokenFor(maria))
        .field('firstName', 'Hacked')
        .attach('photo', Buffer.from('sneaky-image'), PNG);

      assert.equal(res.status, 403);
      assert.deepEqual(filesInUploads(), []);
      assert.equal((await Person.findById(anna._id)).firstName, 'Anna');
    });
  });

  describe('deleting a person', () => {
    it('removes the photo file', async () => {
      const created = (await createWithPhoto({}, 'image-bytes')).body;
      assert.ok(fs.existsSync(fileOf(created.photo)));

      const res = await asUser(request(app).delete(`/api/person/${created._id}`));

      assert.equal(res.status, 200);
      assert.equal(fs.existsSync(fileOf(created.photo)), false);
    });

    it('keeps the photo file until the last person who uses it is gone', async () => {
      const shared = '/uploads/shared.png';
      fs.writeFileSync(path.join(uploadsDir, 'shared.png'), 'shared-image');
      const anna = await createPerson(admin, { firstName: 'Anna', photo: shared });
      const ben = await createPerson(admin, { firstName: 'Ben', photo: shared });

      await asUser(request(app).delete(`/api/person/${anna._id}`));
      assert.ok(fs.existsSync(path.join(uploadsDir, 'shared.png')));

      await asUser(request(app).delete(`/api/person/${ben._id}`));
      assert.equal(fs.existsSync(path.join(uploadsDir, 'shared.png')), false);
    });
  });

  describe('serving photos', () => {
    it('serves a stored photo at its address', async () => {
      const created = (await createWithPhoto({}, 'served-bytes')).body;

      const res = await request(app).get(created.photo);

      assert.equal(res.status, 200);
      assert.equal(res.body.toString(), 'served-bytes');
    });
  });

  describe('removing a photo', () => {
    it('takes the photo away and deletes the file when asked', async () => {
      const created = await createWithPhoto({}, 'image-bytes');
      const photo = created.body.photo;
      assert.ok(fs.existsSync(fileOf(photo)));

      const res = await asUser(request(app).put(`/api/person/${created.body._id}`)).field('removePhoto', 'true');
      assert.equal(res.status, 200);
      assert.ok(!res.body.photo);
      assert.ok(!fs.existsSync(fileOf(photo)));
      assert.ok(!(await Person.findById(created.body._id)).photo);
    });

    it('keeps the photo when nothing is said about it', async () => {
      const created = await createWithPhoto({}, 'image-bytes');
      const res = await asUser(request(app).put(`/api/person/${created.body._id}`)).field('firstName', 'Anne');
      assert.equal(res.status, 200);
      assert.equal(res.body.photo, created.body.photo);
    });

    it('a new photo wins over removePhoto', async () => {
      const created = await createWithPhoto({}, 'old');
      const res = await asUser(request(app).put(`/api/person/${created.body._id}`))
        .field('removePhoto', 'true')
        .attach('photo', Buffer.from('new'), PNG);
      assert.equal(res.status, 200);
      assert.ok(res.body.photo);
      assert.notEqual(res.body.photo, created.body.photo);
    });
  });
});
