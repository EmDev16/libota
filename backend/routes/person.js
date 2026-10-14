const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Person = require('../models/Person');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Make sure the uploads folder exists (same location as before: <project root>/uploads)
const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
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

// Works whether auth middleware sets req.user._id or req.user.id
const getUserId = (req) => req.user && (req.user._id || req.user.id);

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

// Create person (all authenticated users can add)
router.post('/', auth, uploadPhoto, async (req, res) => {
  try {
    const { firstName, lastName, birthDate, deathDate, gender, description, parents, spouses } = req.body;

    const person = new Person({
      firstName,
      lastName,
      birthDate: birthDate ? new Date(birthDate) : null,
      deathDate: deathDate ? new Date(deathDate) : null,
      gender: gender ? gender.toLowerCase() : gender,
      description: description || '',
      photo: req.file ? `/uploads/${req.file.filename}` : null,
      parents: parseIds(parents),
      spouses: parseIds(spouses),
      createdBy: getUserId(req)
    });

    await person.save();

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
    }

    const savedPerson = await Person.findById(person._id)
      .populate('parents', 'firstName lastName')
      .populate('spouses', 'firstName lastName')
      .populate('children', 'firstName lastName')
      .populate('createdBy', 'username');

    res.status(201).json(savedPerson);
  } catch (error) {
    console.error('Create person failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update person (admin only, or creator if member)
router.put('/:id', auth, uploadPhoto, async (req, res) => {
  try {
    const person = await Person.findById(req.params.id);

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Check permissions
    const currentUserId = String(getUserId(req));
    const creatorId = person.createdBy ? person.createdBy.toString() : '';
    if (req.user.role !== 'admin' && creatorId !== currentUserId) {
      return res.status(403).json({ error: 'Not authorized to update this person' });
    }

    const { firstName, lastName, birthDate, deathDate, gender, description, parents, spouses } = req.body;

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
      { $pull: { spouses: person._id } }
    );
    await Person.updateMany(
      { _id: { $in: newSpouses.filter((s) => !oldSpouses.includes(s)) } },
      { $addToSet: { spouses: person._id } }
    );

    person.firstName = firstName || person.firstName;
    person.lastName = lastName || person.lastName;
    person.birthDate = birthDate !== undefined ? (birthDate ? new Date(birthDate) : null) : person.birthDate;
    person.deathDate = deathDate !== undefined ? (deathDate ? new Date(deathDate) : null) : person.deathDate;
    person.gender = gender ? gender.toLowerCase() : person.gender;
    person.description = description !== undefined ? description : person.description;
    person.parents = newParents;
    person.spouses = newSpouses;

    if (req.file) {
      person.photo = `/uploads/${req.file.filename}`;
    }

    await person.save();

    const updatedPerson = await Person.findById(person._id)
      .populate('parents', 'firstName lastName')
      .populate('spouses', 'firstName lastName')
      .populate('children', 'firstName lastName')
      .populate('createdBy', 'username');

    res.json(updatedPerson);
  } catch (error) {
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
        { $pull: { spouses: person._id } }
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
    res.json({ message: 'Person deleted successfully' });
  } catch (error) {
    console.error('Delete person failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;