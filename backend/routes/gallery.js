// The family gallery. Admins add, change and delete photos; everyone logged in can look.
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const GalleryPhoto = require('../models/GalleryPhoto');
const { auth, adminAuth } = require('../middleware/auth');
const { savePhoto, removePhoto } = require('../utils/photoStorage');
const { logEvent } = require('../utils/audit');

const router = express.Router();

const MAX_FILES = 20; // per upload
const GALLERY_SIZE = 2000; // longest side of a stored photo, in pixels

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/;
    if (ok.test(path.extname(file.originalname).toLowerCase()) && ok.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});
const uploadPhotos = (req, res, next) => {
  upload.array('photos', MAX_FILES)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

class Invalid extends Error {}
const isText = (v) => typeof v === 'string';
const validDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime());

// "#Family  gathering 2018 " -> "family gathering 2018"
const cleanTag = (tag) =>
  (isText(tag) ? tag : '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 40);

const cleanTags = (list) => {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new Invalid('Invalid tags');
  const tags = [...new Set(list.map(cleanTag).filter(Boolean))];
  if (tags.length > 10) throw new Invalid('At most 10 tags per photo');
  return tags;
};

const dimension = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 30000 ? n : null;
};

// Checks the details typed for a photo and returns the clean version (also used by member suggestions)
const cleanMeta = (raw) => {
  const meta = raw && typeof raw === 'object' ? raw : {};
  const out = {
    caption: isText(meta.caption) ? meta.caption.trim().slice(0, 300) : '',
    album: isText(meta.album) ? meta.album.trim().slice(0, 80) : '',
    tags: cleanTags(meta.tags),
    width: dimension(meta.width),
    height: dimension(meta.height),
    takenYear: null,
    takenDate: null
  };
  if (meta.date) {
    if (!isText(meta.date) || !validDay(meta.date)) throw new Invalid('Invalid date');
    out.takenDate = new Date(meta.date);
    out.takenYear = out.takenDate.getUTCFullYear();
  } else if (meta.year !== undefined && meta.year !== null && meta.year !== '') {
    const year = Number(meta.year);
    if (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 1) throw new Invalid('Invalid year');
    out.takenYear = year;
  }
  return out;
};

const view = (p) => ({
  id: p._id,
  image: p.image,
  width: p.width,
  height: p.height,
  caption: p.caption,
  year: p.takenYear,
  date: p.takenDate ? new Date(p.takenDate).toISOString().slice(0, 10) : '',
  album: p.album,
  tags: p.tags,
  createdAt: p.createdAt
});

const photoName = (p) => p.caption || p.album || 'Photo';

// All photos, newest first. Optional filters: ?album=&tag=&year=
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (isText(req.query.album) && req.query.album) filter.album = req.query.album;
    if (isText(req.query.tag) && req.query.tag) filter.tags = cleanTag(req.query.tag);
    if (req.query.year && Number.isInteger(Number(req.query.year))) filter.takenYear = Number(req.query.year);
    const photos = await GalleryPhoto.find(filter).sort({ sortDate: -1, createdAt: -1 }).limit(5000).lean();
    res.json(photos.map(view));
  } catch (error) {
    console.error('Reading the gallery failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Add photos (admin). multipart: photos (1-20 files), items (JSON list with the details of each photo, same order)
router.post('/', adminAuth, uploadPhotos, async (req, res) => {
  const saved = [];
  try {
    const files = req.files || [];
    let rawItems;
    try {
      rawItems = JSON.parse(req.body.items || '[]');
    } catch {
      rawItems = null;
    }
    if (files.length === 0) return res.status(400).json({ error: 'Choose at least one photo' });
    if (!Array.isArray(rawItems)) return res.status(400).json({ error: 'Invalid details' });

    const metas = files.map((_, i) => cleanMeta(rawItems[i]));
    for (const file of files) {
      saved.push(await savePhoto(file, { maxSize: GALLERY_SIZE }));
    }
    const docs = [];
    for (let i = 0; i < files.length; i += 1) {
      docs.push(await GalleryPhoto.create({ ...metas[i], image: saved[i], createdBy: req.user._id }));
    }
    for (const doc of docs) {
      await logEvent(req, { action: 'gallery.create', targetType: 'photo', targetId: doc._id, targetName: photoName(doc) });
    }
    res.status(201).json(docs.map(view));
  } catch (error) {
    for (const image of saved) await removePhoto(image);
    if (error instanceof Invalid) return res.status(400).json({ error: error.message });
    console.error('Adding gallery photos failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Change the details of a photo (admin)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Photo not found' });
    const photo = await GalleryPhoto.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const meta = cleanMeta(req.body);
    photo.caption = meta.caption;
    photo.album = meta.album;
    photo.tags = meta.tags;
    photo.takenYear = meta.takenYear;
    photo.takenDate = meta.takenDate;
    await photo.save();
    await logEvent(req, { action: 'gallery.update', targetType: 'photo', targetId: photo._id, targetName: photoName(photo) });
    res.json(view(photo));
  } catch (error) {
    if (error instanceof Invalid) return res.status(400).json({ error: error.message });
    console.error('Changing a gallery photo failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Delete a photo (admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Photo not found' });
    const photo = await GalleryPhoto.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    await GalleryPhoto.findByIdAndDelete(photo._id);
    await removePhoto(photo.image);
    await logEvent(req, { action: 'gallery.delete', targetType: 'photo', targetId: photo._id, targetName: photoName(photo) });
    res.json({ message: 'Photo deleted' });
  } catch (error) {
    console.error('Deleting a gallery photo failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
module.exports.cleanMeta = cleanMeta;
module.exports.Invalid = Invalid;
module.exports.GALLERY_SIZE = GALLERY_SIZE;
module.exports.photoName = photoName;
