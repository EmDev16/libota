// Where photos are kept:
//   - CLOUDINARY_URL is set  -> photos go to Cloudinary, the database stores the full https address
//   - CLOUDINARY_URL is empty -> photos go to the uploads folder, the database stores "/uploads/<file>"
// Both kinds of address can live side by side in the same database.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// <project root>/uploads by default; UPLOADS_DIR can point somewhere else (the tests use a temp folder)
const getUploadDir = () => process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

const useCloudinary = () => Boolean(process.env.CLOUDINARY_URL);

// Only loaded when needed. The SDK reads CLOUDINARY_URL by itself.
const cloudinary = () => require('cloudinary').v2;

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const isCloudinaryUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || '');

// https://res.cloudinary.com/<cloud>/image/upload/v123/libota/abc.jpg  ->  libota/abc
const extractPublicId = (url) => {
  const match = /\/upload\/(?:v\d+\/)?(.+)\.[A-Za-z0-9]+$/.exec(url || '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
};

const saveLocal = async (file) => {
  const dir = getUploadDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const ext = EXTENSIONS[file.mimetype] || '.jpg';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.promises.writeFile(path.join(dir, name), file.buffer);
  return `/uploads/${name}`;
};

const saveCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary().uploader.upload_stream(
      {
        folder: 'libota',
        resource_type: 'image',
        // Keep the stored picture small: nobody needs more than this on screen or in a PDF
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }, { quality: 'auto' }]
      },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    );
    stream.end(file.buffer);
  });

// file: a multer file held in memory ({ buffer, mimetype }). Returns what to store in person.photo.
const savePhoto = (file) => (useCloudinary() ? saveCloudinary(file) : saveLocal(file));

// Best effort: a photo that cannot be removed is logged, it never makes a request fail.
const removePhoto = async (photo) => {
  if (!photo) return;
  try {
    if (/^https?:\/\//i.test(photo)) {
      const publicId = isCloudinaryUrl(photo) ? extractPublicId(photo) : null;
      if (publicId && useCloudinary()) {
        await cloudinary().uploader.destroy(publicId, { resource_type: 'image' });
      }
      return;
    }
    // basename: whatever is stored, never leave the uploads folder
    await fs.promises.unlink(path.join(getUploadDir(), path.basename(photo)));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not remove photo:', photo, error.message);
  }
};

module.exports = {
  getUploadDir,
  useCloudinary,
  isCloudinaryUrl,
  extractPublicId,
  savePhoto,
  removePhoto
};