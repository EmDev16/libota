const express = require('express');
const multer = require('multer');
const path = require('path');
const Person = require('../models/Person');
const { auth, adminAuth } = require('../middleware/auth');
const { computeStats } = require('../utils/stats');
const { savePhoto, removePhoto } = require('../utils/photoStorage');

const router = express.Router();

// Photos are read into memory and then stored by utils/photoStorage.js
// (Cloudinary when CLOUDINARY_URL is set, otherwise the uploads folder).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Wrap multer so upload errors come back as JSON (and get logged) instead of an HTML 500 page
const uploadPhoto = (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error('Photo upload failed:', err);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// Accepts a JSON string ('["id1","id2"]'), a real array, or a comma-separated string
const parseIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

// formerSpouses can only name people who are spouses, and each person once
const onlySpouses = (former, spouses) => {
  const allowed = new Set(spouses.map(String));
  return [...new Set(former.map(String))].filter((id) => allowed.has(id));
};

// Keeps the "relationship ended" mark the same on both people of every partnership
const syncFormerSpouses = async (personId, spouses, former) => {
  const ended = former.map(String);
  const current = spouses.map(String).filter((id) => !ended.includes(id));
  if (ended.length > 0) {
    await Person.updateMany({ _id: { $in: ended } }, { $addToSet: { formerSpouses: personId } });
  }
  if (current.length > 0) {
    await Person.updateMany({ _id: { $in: current } }, { $pull: { formerSpouses: personId } });
  }
};

// Works whether auth middleware sets req.user._id or req.user.id
const getUserId = (req) => req.user && (req.user._id || req.user.id);

// Removes a photo, unless another person still uses it (an import can copy photo addresses)
const releasePhoto = async (photo, personId) => {
  if (!photo) return;
  const stillUsed = await Person.exists({ photo, _id: { $ne: personId } });
  if (!stillUsed) await removePhoto(photo);
};

// Get all people
router.get('/', auth, async (req, res) => {
  try {
    const people = await Person.find()
      .populate('parents', 'firstName lastName')
      .populate('spouses', 'firstName lastName')
      .populate('children', 'firstName lastName')
      .populate('createdBy', 'username')
      .sort({ lastName: 1, firstName: 1 });
    res.json(people);
  } catch (error) {
    console.error('Get people failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Numbers for the dashboard. Must come before '/:id', or "stats" would be read as an id.
// The browser sends its own date (?today=2026-10-22) so birthdays follow the family's time zone.
router.get('/stats', auth, async (req, res) => {
  try {
    // Statistics show the whole family, so an account only gets them when an admin allowed it
    if (req.user.role !== 'admin' && req.user.showStats !== true) {
      return res.status(403).json({ error: 'Statistics are not available for this account' });
    }
    const people = await Person.find().select(
      'firstName lastName birthDate deathDate parents spouses createdAt'
    );
    res.json(computeStats(people, { today: req.query.today }));
  } catch (error) {
    console.error('Get stats failed:', error);
    res.status(500).json({ error: 'Could not calculate the statistics' });
  }
});

// Get single person
router.get('/:id', auth, async (req, res) => {
  try {
    const person = await Person.findById(req.params.id)
      .populate('parents', 'firstName lastName birthDate deathDate gender photo')
      .populate('spouses', 'firstName lastName birthDate deathDate gender photo')
      .populate('children', 'firstName lastName birthDate deathDate gender photo')
      .populate('createdBy', 'username');

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    res.json(person);
  } catch (error) {
    console.error('Get person failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create person (admin only: members can only look)
router.post('/', adminAuth, uploadPhoto, async (req, res) => {
  let newPhoto = null;
  let saved = false;

  try {
    const { firstName, lastName, birthDate, deathDate, gender, description, parents, spouses, formerSpouses } = req.body;

    if (req.file) {
      newPhoto = await savePhoto(req.file);
    }

    const spouseIds = parseIds(spouses);
    const person = new Person({
      firstName,
      lastName,
      birthDate: birthDate ? new Date(birthDate) : null,
      deathDate: deathDate ? new Date(deathDate) : null,
      gender: gender ? gender.toLowerCase() : gender,
      description: description || '',
      photo: newPhoto,
      parents: parseIds(parents),
      spouses: spouseIds,
      formerSpouses: onlySpouses(parseIds(formerSpouses), spouseIds),
      createdBy: getUserId(req)
    });

    await person.save();
    saved = true;

    // Update parents' children arrays
    if (person.parents && person.parents.length > 0) {
      await Person.updateMany(
        { _id: { $in: person.parents } },
        { $addToSet: { children: person._id } }
      );
    }

    // Update spouses' spouse arrays
    if (person.spouses && person.spouses.length > 0) {
      await Person.updateMany(
        { _id: { $in: person.spouses } },
        { $addToSet: { spouses: person._id } }
      );
      await syncFormerSpouses(person._id, person.spouses, person.formerSpouses);
    }

    const savedPerson = await Person.findById(person._id)
      .populate('parents', 'firstName lastName')
      .populate('spouses', 'firstName lastName')
      .populate('children', 'firstName lastName')
      .populate('createdBy', 'username');

    res.status(201).json(savedPerson);
  } catch (error) {
    // Do not leave an uploaded photo behind for a person that was never saved
    if (newPhoto && !saved) await removePhoto(newPhoto);

    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Create person failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update person (admin only)
router.put('/:id', adminAuth, uploadPhoto, async (req, res) => {
  let newPhoto = null;
  let saved = false;

  try {
    const person = await Person.findById(req.params.id);

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const { firstName, lastName, birthDate, deathDate, gender, description, parents, spouses, formerSpouses } = req.body;

    if (req.file) {
      newPhoto = await savePhoto(req.file);
    }

    // Parents: compare as strings so ObjectIds and ids from the form match
    const oldParents = (person.parents || []).map(String);
    const newParents = parseIds(parents);

    await Person.updateMany(
      { _id: { $in: oldParents.filter((p) => !newParents.includes(p)) } },
      { $pull: { children: person._id } }
    );
    await Person.updateMany(
      { _id: { $in: newParents.filter((p) => !oldParents.includes(p)) } },
      { $addToSet: { children: person._id } }
    );

    // Spouses
    const oldSpouses = (person.spouses || []).map(String);
    const newSpouses = parseIds(spouses);

    await Person.updateMany(
      { _id: { $in: oldSpouses.filter((s) => !newSpouses.includes(s)) } },
      { $pull: { spouses: person._id, formerSpouses: person._id } }
    );
    await Person.updateMany(
      { _id: { $in: newSpouses.filter((s) => !oldSpouses.includes(s)) } },
      { $addToSet: { spouses: person._id } }
    );

    // Ended relationships: when the form does not send them, what was saved stays as it is
    const newFormer = onlySpouses(
      formerSpouses === undefined ? (person.formerSpouses || []).map(String) : parseIds(formerSpouses),
      newSpouses
    );
    await syncFormerSpouses(person._id, newSpouses, newFormer);

    person.firstName = firstName || person.firstName;
    person.lastName = lastName || person.lastName;
    person.birthDate = birthDate !== undefined ? (birthDate ? new Date(birthDate) : null) : person.birthDate;
    person.deathDate = deathDate !== undefined ? (deathDate ? new Date(deathDate) : null) : person.deathDate;
    person.gender = gender ? gender.toLowerCase() : person.gender;
    person.description = description !== undefined ? description : person.description;
    person.parents = newParents;
    person.spouses = newSpouses;
    person.formerSpouses = newFormer;

    const oldPhoto = person.photo;
    if (newPhoto) {
      person.photo = newPhoto;
    }

    await person.save();
    saved = true;

    // The photo that was replaced is no longer needed
    if (newPhoto && oldPhoto) {
      await releasePhoto(oldPhoto, person._id);
    }

    const updatedPerson = await Person.findById(person._id)
      .populate('parents', 'firstName lastName')
      .populate('spouses', 'firstName lastName')
      .populate('children', 'firstName lastName')
      .populate('createdBy', 'username');

    res.json(updatedPerson);
  } catch (error) {
    if (newPhoto && !saved) await removePhoto(newPhoto);

    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Update person failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete person (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const person = await Person.findById(req.params.id);

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Remove this person from parents' children arrays
    if (person.parents && person.parents.length > 0) {
      await Person.updateMany(
        { _id: { $in: person.parents } },
        { $pull: { children: person._id } }
      );
    }

    // Remove this person from spouses' spouse arrays
    if (person.spouses && person.spouses.length > 0) {
      await Person.updateMany(
        { _id: { $in: person.spouses } },
        { $pull: { spouses: person._id, formerSpouses: person._id } }
      );
    }

    // Remove this person from children's parents arrays
    if (person.children && person.children.length > 0) {
      await Person.updateMany(
        { _id: { $in: person.children } },
        { $pull: { parents: person._id } }
      );
    }

    await Person.findByIdAndDelete(req.params.id);
    await releasePhoto(person.photo, person._id);

    res.json({ message: 'Person deleted successfully' });
  } catch (error) {
    console.error('Delete person failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;