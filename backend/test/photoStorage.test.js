// Photo storage on disk, and the helpers that recognise Cloudinary addresses.
// No database and no network needed.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libota-photo-unit-'));
process.env.UPLOADS_DIR = uploadsDir;
delete process.env.CLOUDINARY_URL;

const {
  getUploadDir,
  useCloudinary,
  isCloudinaryUrl,
  extractPublicId,
  savePhoto,
  removePhoto
} = require('../utils/photoStorage');

const image = (name = 'a.png', mimetype = 'image/png', content = 'fake image bytes') => ({
  originalname: name,
  mimetype,
  buffer: Buffer.from(content)
});

describe('photoStorage', () => {
  after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

  describe('settings', () => {
    it('uses the folder from UPLOADS_DIR', () => {
      assert.equal(getUploadDir(), uploadsDir);
    });

    it('keeps photos on disk when CLOUDINARY_URL is empty', () => {
      assert.equal(useCloudinary(), false);
    });

    it('switches to Cloudinary when CLOUDINARY_URL is set', () => {
      process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';
      assert.equal(useCloudinary(), true);
      delete process.env.CLOUDINARY_URL;
    });
  });

  describe('saving on disk', () => {
    it('stores the file and returns an /uploads/ address', async () => {
      const photo = await savePhoto(image('anna.png', 'image/png', 'hello'));

      assert.match(photo, /^\/uploads\/[\w-]+\.png$/);
      const stored = fs.readFileSync(path.join(uploadsDir, path.basename(photo)), 'utf8');
      assert.equal(stored, 'hello');
    });

    it('gives every photo its own name', async () => {
      const first = await savePhoto(image());
      const second = await savePhoto(image());

      assert.notEqual(first, second);
    });

    it('chooses the extension from the file type, not from the name', async () => {
      const photo = await savePhoto(image('holiday.exe', 'image/webp'));

      assert.match(photo, /\.webp$/);
    });

    it('creates the folder when it does not exist yet', async () => {
      const nested = path.join(uploadsDir, 'not', 'there', 'yet');
      process.env.UPLOADS_DIR = nested;

      const photo = await savePhoto(image());

      assert.ok(fs.existsSync(path.join(nested, path.basename(photo))));
      process.env.UPLOADS_DIR = uploadsDir;
    });
  });

  describe('removing', () => {
    it('deletes the file of a photo on disk', async () => {
      const photo = await savePhoto(image());
      const file = path.join(uploadsDir, path.basename(photo));
      assert.ok(fs.existsSync(file));

      await removePhoto(photo);

      assert.equal(fs.existsSync(file), false);
    });

    it('does not mind a file that is already gone', async () => {
      await assert.doesNotReject(removePhoto('/uploads/never-existed.png'));
    });

    it('does nothing for an empty value', async () => {
      await assert.doesNotReject(removePhoto(null));
      await assert.doesNotReject(removePhoto(''));
    });

    it('never leaves the uploads folder, whatever the stored value says', async () => {
      const outside = path.join(os.tmpdir(), 'libota-outside.txt');
      fs.writeFileSync(outside, 'keep me');

      await removePhoto('/uploads/../../../' + path.basename(outside));

      assert.ok(fs.existsSync(outside));
      fs.unlinkSync(outside);
    });

    it('leaves an address on another website alone', async () => {
      await assert.doesNotReject(removePhoto('https://example.com/photo.jpg'));
    });

    it('does not try to delete from Cloudinary without Cloudinary settings', async () => {
      await assert.doesNotReject(
        removePhoto('https://res.cloudinary.com/demo/image/upload/v1699999999/libota/abc.jpg')
      );
    });
  });

  describe('Cloudinary addresses', () => {
    it('recognises them', () => {
      assert.equal(isCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v1/libota/a.jpg'), true);
      assert.equal(isCloudinaryUrl('https://example.com/a.jpg'), false);
      assert.equal(isCloudinaryUrl('/uploads/a.jpg'), false);
      assert.equal(isCloudinaryUrl(undefined), false);
    });

    it('finds the public id in an address with a version', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/v1699999999/libota/abc123.jpg';

      assert.equal(extractPublicId(url), 'libota/abc123');
    });

    it('finds the public id in an address without a version', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/libota/abc123.png';

      assert.equal(extractPublicId(url), 'libota/abc123');
    });

    it('keeps dots inside the name', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/v1/libota/my.photo.jpg';

      assert.equal(extractPublicId(url), 'libota/my.photo');
    });

    it('gives nothing for an address that is not an upload', () => {
      assert.equal(extractPublicId('https://example.com/a.jpg'), null);
      assert.equal(extractPublicId(undefined), null);
    });
  });
});