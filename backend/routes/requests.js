// Suggestions from members (new people, missing information, "I am missing") and the admin's
// answer to them. Members never change people directly; an admin approves every suggestion.
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const Person = require('../models/Person');
const SuggestionRequest = require('../models/SuggestionRequest');
const { auth, adminAuth } = require('../middleware/auth');
const { savePhoto, removePhoto } = require('../utils/photoStorage');
const { logEvent, personSnapshot } = require('../utils/audit');

const router = express.Router();

const MAX_ITEMS = 10; // per submission
const MAX_PENDING = 20; // waiting suggestions per account
const FIELDS = ['firstName', 'lastName', 'birthDate', 'deathDate', 'gender', 'description'];
const LIMITS = { firstName: 80, lastName: 80, description: 2000, note: 500, relation: 200, senderName: 60 };
const GENDERS = ['male', 'female', 'other'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_ITEMS },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/;
    if (ok.test(path.extname(file.originalname).toLowerCase()) && ok.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

const uploadPhotos = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const memberOnly = (req, res, next) =>
  auth(req, res, () => {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Admins change people directly' });
    }
    next();
  });

const isText = (v) => typeof v === 'string';
const clean = (v, max) => (isText(v) ? v.trim().slice(0, max) : '');
const validDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime());

class Invalid extends Error {}

// Checks one suggestion from the browser and returns the clean version
const cleanPersonFields = (raw, { requireNames }) => {
  const out = {};
  for (const field of FIELDS) {
    const value = clean(raw && raw[field], LIMITS[field] || 20);
    if (!value) continue;
    if ((field === 'birthDate' || field === 'deathDate') && !validDay(value)) throw new Invalid('Invalid date');
    if (field === 'gender' && !GENDERS.includes(value.toLowerCase())) throw new Invalid('Invalid gender');
    out[field] = field === 'gender' ? value.toLowerCase() : value;
  }
  if (requireNames && (!out.firstName || !out.lastName || !out.gender)) {
    throw new Invalid('First name, last name and gender are required');
  }
  return out;
};

const cleanItem = async (raw, hasPhoto) => {
  if (!raw || typeof raw !== 'object') throw new Invalid('Invalid suggestion');
  const note = clean(raw.note, LIMITS.note);

  if (raw.type === 'correction') {
    if (!isText(raw.personId) || !mongoose.isValidObjectId(raw.personId)) throw new Invalid('Choose a person');
    const person = await Person.findById(raw.personId).select('firstName lastName');
    if (!person) throw new Invalid('Person not found');
    const changes = cleanPersonFields(raw.changes, { requireNames: false });
    if (Object.keys(changes).length === 0 && !hasPhoto) throw new Invalid('Nothing to change');
    return { type: 'correction', note, personId: person._id, personName: `${person.firstName} ${person.lastName}`, changes };
  }

  if (raw.type === 'newPerson' || raw.type === 'me') {
    const newPerson = cleanPersonFields(raw.newPerson, { requireNames: true });
    return { type: raw.type, note, newPerson, relation: clean(raw.relation, LIMITS.relation) };
  }
  throw new Invalid('Invalid suggestion');
};

// Send suggestions. multipart: senderName, items (JSON text), photo_0, photo_1, ... (one per suggestion)
router.post('/', memberOnly, uploadPhotos, async (req, res) => {
  const saved = [];
  try {
    let rawItems;
    try {
      rawItems = JSON.parse(req.body.items);
    } catch {
      rawItems = null;
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
      return res.status(400).json({ error: `Send between 1 and ${MAX_ITEMS} suggestions` });
    }

    const files = new Map((req.files || []).map((f) => [f.fieldname, f]));
    const items = [];
    for (let i = 0; i < rawItems.length; i += 1) {
      items.push(await cleanItem(rawItems[i], files.has(`photo_${i}`)));
    }

    // Limit what one account can leave waiting
    const waiting = await SuggestionRequest.aggregate([
      { $match: { createdBy: req.user._id } },
      { $unwind: '$items' },
      { $match: { 'items.status': 'pending' } },
      { $count: 'n' }
    ]);
    if (((waiting[0] && waiting[0].n) || 0) + items.length > MAX_PENDING) {
      return res.status(429).json({ error: 'Too many suggestions are waiting. Wait for an admin to answer them first.' });
    }

    for (let i = 0; i < items.length; i += 1) {
      const file = files.get(`photo_${i}`);
      if (file) {
        items[i].photo = await savePhoto(file);
        saved.push(items[i].photo);
      }
    }

    const request = await SuggestionRequest.create({
      createdBy: req.user._id,
      account: req.user.username,
      senderName: clean(req.body.senderName, LIMITS.senderName) || req.user.username,
      items
    });
    await logEvent(req, {
      action: 'request.create',
      targetType: 'request',
      targetId: request._id,
      targetName: request.senderName,
      message: `${items.length} suggestion(s)`
    });
    res.status(201).json({ id: request._id, count: items.length });
  } catch (error) {
    for (const photo of saved) await removePhoto(photo);
    if (error instanceof Invalid) return res.status(400).json({ error: error.message });
    console.error('Sending suggestions failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// What this account sent, and how it was answered
router.get('/mine', memberOnly, async (req, res) => {
  try {
    const requests = await SuggestionRequest.find({ createdBy: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json(requests);
  } catch (error) {
    console.error('Reading suggestions failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Number of suggestions waiting for an answer (for the badge)
router.get('/count', adminAuth, async (req, res) => {
  try {
    const result = await SuggestionRequest.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.status': 'pending' } },
      { $count: 'n' }
    ]);
    res.json({ pending: (result[0] && result[0].n) || 0 });
  } catch (error) {
    console.error('Counting suggestions failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// All suggestions, newest first. ?status=pending leaves out what was fully answered.
router.get('/', adminAuth, async (req, res) => {
  try {
    const filter = req.query.status === 'pending' ? { 'items.status': 'pending' } : {};
    const requests = await SuggestionRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean();

    // For a waiting correction, show what the person has now, so the admin can compare
    const ids = [];
    for (const r of requests) {
      for (const item of r.items) {
        if (item.type === 'correction' && item.status === 'pending' && item.personId) ids.push(item.personId);
      }
    }
    const people = ids.length
      ? await Person.find({ _id: { $in: ids } }).select(`${FIELDS.join(' ')} photo`).lean()
      : [];
    const byId = new Map(people.map((p) => [String(p._id), p]));
    for (const r of requests) {
      for (const item of r.items) {
        const p = item.type === 'correction' && item.status === 'pending' ? byId.get(String(item.personId)) : null;
        if (!p) continue;
        item.current = {
          firstName: p.firstName,
          lastName: p.lastName,
          birthDate: p.birthDate ? new Date(p.birthDate).toISOString().slice(0, 10) : '',
          deathDate: p.deathDate ? new Date(p.deathDate).toISOString().slice(0, 10) : '',
          gender: p.gender,
          description: p.description || '',
          photo: p.photo || null
        };
      }
    }
    res.json(requests);
  } catch (error) {
    console.error('Reading suggestions failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const findItem = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.itemId)) {
    res.status(404).json({ error: 'Suggestion not found' });
    return null;
  }
  const request = await SuggestionRequest.findById(req.params.id);
  const item = request && request.items.id(req.params.itemId);
  if (!item) {
    res.status(404).json({ error: 'Suggestion not found' });
    return null;
  }
  if (item.status !== 'pending') {
    res.status(409).json({ error: 'This suggestion was already answered' });
    return null;
  }
  return { request, item };
};

const toDate = (v) => (v ? new Date(v) : null);

// Approve: a correction is applied to the person, a new person is added (without family links:
// the admin links them afterwards). Both appear in the activity log and can be restored there.
router.post('/:id/items/:itemId/approve', adminAuth, async (req, res) => {
  try {
    const found = await findItem(req, res);
    if (!found) return;
    const { request, item } = found;
    let personId;

    if (item.type === 'correction') {
      const person = await Person.findById(item.personId);
      if (!person) return res.status(409).json({ error: 'This person no longer exists' });
      const before = await personSnapshot(person);
      const c = item.changes || {};
      // remember what was there before, for the record
      item.previous = {};
      for (const f of FIELDS) if (c[f]) item.previous[f] = before[f] == null ? '' : before[f];
      if (item.photo) item.previous.photo = before.photo || null;
      item.markModified('previous');
      if (c.firstName) person.firstName = c.firstName;
      if (c.lastName) person.lastName = c.lastName;
      if (c.birthDate) person.birthDate = toDate(c.birthDate);
      if (c.deathDate) person.deathDate = toDate(c.deathDate);
      if (c.gender) person.gender = c.gender;
      if (c.description) person.description = c.description;
      const oldPhoto = person.photo;
      if (item.photo) person.photo = item.photo;
      await person.save();
      if (item.photo && oldPhoto && !(await Person.exists({ photo: oldPhoto, _id: { $ne: person._id } }))) {
        await removePhoto(oldPhoto);
      }
      personId = person._id;
      await logEvent(req, {
        action: 'person.update',
        targetType: 'person',
        targetId: person._id,
        targetName: `${person.firstName} ${person.lastName}`,
        message: `Approved suggestion from ${request.senderName} (${request.account})`,
        before,
        after: await personSnapshot(await Person.findById(person._id))
      });
    } else {
      const n = item.newPerson || {};
      const person = await Person.create({
        firstName: n.firstName,
        lastName: n.lastName,
        birthDate: toDate(n.birthDate),
        deathDate: toDate(n.deathDate),
        gender: n.gender,
        description: n.description || '',
        photo: item.photo || null,
        createdBy: req.user._id
      });
      personId = person._id;
      await logEvent(req, {
        action: 'person.create',
        targetType: 'person',
        targetId: person._id,
        targetName: `${person.firstName} ${person.lastName}`,
        message: `Approved suggestion from ${request.senderName} (${request.account})`,
        after: await personSnapshot(person)
      });
    }

    item.status = 'approved';
    item.handledAt = new Date();
    item.handledBy = req.user.username;
    item.resultPersonId = personId;
    await request.save();
    await logEvent(req, { action: 'request.approve', targetType: 'request', targetId: request._id, targetName: request.senderName });
    res.json({ message: 'Approved', personId });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ error: error.message });
    console.error('Approving a suggestion failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/:id/items/:itemId/reject', adminAuth, async (req, res) => {
  try {
    const found = await findItem(req, res);
    if (!found) return;
    const { request, item } = found;

    if (item.photo) {
      await removePhoto(item.photo);
      item.photo = null;
    }
    item.status = 'rejected';
    item.rejectReason = clean(req.body && req.body.reason, 300);
    item.handledAt = new Date();
    item.handledBy = req.user.username;
    await request.save();
    await logEvent(req, {
      action: 'request.reject',
      targetType: 'request',
      targetId: request._id,
      targetName: request.senderName,
      message: item.rejectReason
    });
    res.json({ message: 'Rejected' });
  } catch (error) {
    console.error('Rejecting a suggestion failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
