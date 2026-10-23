// The family gallery. Admins add, change and delete photos; everyone logged in can look,
// but members only see the photos their account may see (see "Hidden tags" below).
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const GalleryPhoto = require('../models/GalleryPhoto');
const Person = require('../models/Person');
const { auth, adminAuth } = require('../middleware/auth');
const { savePhoto, removePhoto } = require('../utils/photoStorage');
const { logEvent } = require('../utils/audit');
const { cleanTag, cleanTagList, InvalidTags } = require('../utils/tags');

const router = express.Router();

const MAX_FILES = 20; // per upload
const GALLERY_SIZE = 2560; // longest side of a stored photo, in pixels
const TIMELINE_TAG = 'timeline'; // the hidden tag that puts a photo on the timeline page

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
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dimension = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 30000 ? n : null;
};

// A position on the picture: 0-100 (percent) or nothing
const position = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Invalid('Invalid position');
  return Math.round(n * 10) / 10;
};

// People on a photo: somebody of the family (personId), or just a name (somebody else, nobody is created)
const cleanPeople = async (list) => {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 30) throw new Invalid('Invalid people');
  const people = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') throw new Invalid('Invalid people');
    let name = isText(entry.name) ? entry.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    let personId = null;
    if (entry.personId) {
      if (!isText(entry.personId) || !mongoose.isValidObjectId(entry.personId)) throw new Invalid('Invalid person');
      const person = await Person.findById(entry.personId).select('firstName lastName');
      if (!person) throw new Invalid('Person not found');
      personId = person._id;
      name = `${person.firstName} ${person.lastName}`;
    }
    if (!name) throw new Invalid('Every person on a photo needs a name');
    let x = position(entry.x);
    let y = position(entry.y);
    if (x === null || y === null) {
      x = null;
      y = null;
    }
    people.push({ personId, name, x, y });
  }
  return people;
};

// "christmas 2019" typed for the album "Christmas 2019" uses the album that already exists
const snapAlbum = async (album) => {
  if (!album) return '';
  const existing = await GalleryPhoto.findOne({ album: new RegExp(`^${escapeRegex(album)}$`, 'i') }).select('album');
  return existing ? existing.album : album;
};

// Checks the details typed for a photo and returns the clean version.
// options.admin: hidden tags are only accepted from an admin.
const cleanDetails = async (raw, { admin = false } = {}) => {
  const meta = raw && typeof raw === 'object' ? raw : {};
  const out = {
    caption: isText(meta.caption) ? meta.caption.trim().slice(0, 300) : '',
    album: await snapAlbum(isText(meta.album) ? meta.album.trim().replace(/\s+/g, ' ').slice(0, 80) : ''),
    tags: cleanTagList(meta.tags, 10),
    people: await cleanPeople(meta.people),
    width: dimension(meta.width),
    height: dimension(meta.height),
    takenYear: null,
    takenDate: null
  };
  if (admin) out.hiddenTags = cleanTagList(meta.hiddenTags, 10);
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

// ---- Hidden tags: who sees which photo
// Admins see everything. A member sees a photo when it has no hidden tag at all (the "timeline" tag
// does not count), or when one of its hidden tags is on the account's list, or when the account
// may see all photos.
const visibleTo = (user) => {
  if (user.role === 'admin' || user.galleryAll === true) return {};
  const allowed = (user.galleryTags || []).filter((t) => t !== TIMELINE_TAG);
  return {
    $or: [
      { hiddenTags: { $not: { $elemMatch: { $ne: TIMELINE_TAG } } } },
      { hiddenTags: { $in: allowed } }
    ]
  };
};

// What the browser gets. People are looked up again so a renamed person shows the new name,
// and a person who was deleted from the tree stays on the photo as a plain name.
const present = async (photos, user) => {
  const ids = [];
  for (const p of photos) for (const person of p.people || []) if (person.personId) ids.push(person.personId);
  const found = ids.length ? await Person.find({ _id: { $in: ids } }).select('firstName lastName').lean() : [];
  const names = new Map(found.map((f) => [String(f._id), `${f.firstName} ${f.lastName}`]));
  const admin = user.role === 'admin';

  return photos.map((p) => {
    const hidden = p.hiddenTags || [];
    const out = {
      id: p._id,
      image: p.image,
      width: p.width,
      height: p.height,
      caption: p.caption,
      year: p.takenYear,
      date: p.takenDate ? new Date(p.takenDate).toISOString().slice(0, 10) : '',
      album: p.album,
      tags: p.tags,
      people: (p.people || []).map((person) => {
        const known = person.personId && names.has(String(person.personId));
        return {
          personId: known ? String(person.personId) : null,
          name: known ? names.get(String(person.personId)) : person.name,
          x: person.x,
          y: person.y
        };
      }),
      inTimeline: hidden.includes(TIMELINE_TAG),
      createdAt: p.createdAt
    };
    if (admin) out.hiddenTags = hidden;
    return out;
  });
};

const photoName = (p) => p.caption || p.album || 'Photo';

// All photos this account may see, newest first. Optional filters: ?album=&tag=&year=&person=&timeline=1
router.get('/', auth, async (req, res) => {
  try {
    const clauses = [visibleTo(req.user)];
    if (isText(req.query.album) && req.query.album) clauses.push({ album: req.query.album });
    if (isText(req.query.tag) && req.query.tag) clauses.push({ tags: cleanTag(req.query.tag) });
    if (req.query.year && Number.isInteger(Number(req.query.year))) clauses.push({ takenYear: Number(req.query.year) });
    if (isText(req.query.person) && req.query.person) {
      clauses.push(
        mongoose.isValidObjectId(req.query.person)
          ? { 'people.personId': req.query.person }
          : { 'people.name': new RegExp(`^${escapeRegex(req.query.person.trim())}$`, 'i') }
      );
    }
    if (req.query.timeline === '1') clauses.push({ hiddenTags: TIMELINE_TAG });

    const photos = await GalleryPhoto.find({ $and: clauses }).sort({ sortDate: -1, createdAt: -1 }).limit(5000).lean();
    res.json(await present(photos, req.user));
  } catch (error) {
    console.error('Reading the gallery failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// What already exists, so people pick an existing album or tag instead of typing a near-copy of it
router.get('/options', auth, async (req, res) => {
  try {
    const photos = await GalleryPhoto.find(visibleTo(req.user)).select('album tags hiddenTags people').lean();
    const albums = new Set();
    const tags = new Set();
    const hidden = new Set();
    const outsiders = new Set();
    for (const p of photos) {
      if (p.album) albums.add(p.album);
      for (const t of p.tags || []) tags.add(t);
      for (const t of p.hiddenTags || []) hidden.add(t);
      for (const person of p.people || []) if (!person.personId) outsiders.add(person.name);
    }
    const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b));
    const out = { albums: sorted(albums), tags: sorted(tags), names: sorted(outsiders) };
    if (req.user.role === 'admin') out.hiddenTags = sorted(hidden);
    res.json(out);
  } catch (error) {
    console.error('Reading gallery options failed:', error);
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

    const metas = [];
    for (let i = 0; i < files.length; i += 1) metas.push(await cleanDetails(rawItems[i], { admin: true }));
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
    res.status(201).json(await present(docs.map((d) => d.toObject()), req.user));
  } catch (error) {
    for (const image of saved) await removePhoto(image);
    if (error instanceof Invalid || error instanceof InvalidTags) return res.status(400).json({ error: error.message });
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

    const meta = await cleanDetails(req.body, { admin: true });
    photo.caption = meta.caption;
    photo.album = meta.album;
    photo.tags = meta.tags;
    photo.hiddenTags = meta.hiddenTags;
    photo.people = meta.people;
    photo.takenYear = meta.takenYear;
    photo.takenDate = meta.takenDate;
    await photo.save();
    await logEvent(req, { action: 'gallery.update', targetType: 'photo', targetId: photo._id, targetName: photoName(photo) });
    res.json((await present([photo.toObject()], req.user))[0]);
  } catch (error) {
    if (error instanceof Invalid || error instanceof InvalidTags) return res.status(400).json({ error: error.message });
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
module.exports.cleanDetails = cleanDetails;
module.exports.Invalid = Invalid;
module.exports.GALLERY_SIZE = GALLERY_SIZE;
module.exports.TIMELINE_TAG = TIMELINE_TAG;
module.exports.photoName = photoName;
