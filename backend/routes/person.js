const express = require('express');
const multer = require('multer');
const path = require('path');
const Person = require('../models/Person');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
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
    res.status(500).json({ error: error.message });
  }
});

// Create person (all authenticated users can add)
router.post('/', auth, upload.single('photo'), async (req, res) => {
  try {
    const { firstName, lastName, birthDate, deathDate, gender, description, parents, spouses } = req.body;

    const person = new Person({
      firstName,
      lastName,
      birthDate: birthDate ? new Date(birthDate) : null,
      deathDate: deathDate ? new Date(deathDate) : null,
      gender,
      description: description || '',
      photo: req.file ? `/uploads/${req.file.filename}` : null,
      parents: parents ? JSON.parse(parents) : [],
      spouses: spouses ? JSON.parse(spouses) : [],
      createdBy: req.user._id
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
    res.status(500).json({ error: error.message });
  }
});

// Update person (admin only, or creator if member)
router.put('/:id', auth, upload.single('photo'), async (req, res) => {
  try {
    const person = await Person.findById(req.params.id);

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && person.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this person' });
    }

    const { firstName, lastName, birthDate, deathDate, gender, description, parents, spouses } = req.body;

    // Handle old parents removal
    const oldParents = person.parents || [];
    const newParents = parents ? JSON.parse(parents) : [];

    // Remove this person from old parents' children arrays
    await Person.updateMany(
      { _id: { $in: oldParents.filter(p => !newParents.includes(p.toString())) } },
      { $pull: { children: person._id } }
    );

    // Add this person to new parents' children arrays
    await Person.updateMany(
      { _id: { $in: newParents.filter(p => !oldParents.includes(p.toString())) } },
      { $addToSet: { children: person._id } }
    );

    // Handle old spouses removal
    const oldSpouses = person.spouses || [];
    const newSpouses = spouses ? JSON.parse(spouses) : [];

    // Remove this person from old spouses' spouse arrays
    await Person.updateMany(
      { _id: { $in: oldSpouses.filter(s => !newSpouses.includes(s.toString())) } },
      { $pull: { spouses: person._id } }
    );

    // Add this person to new spouses' spouse arrays
    await Person.updateMany(
      { _id: { $in: newSpouses.filter(s => !oldSpouses.includes(s.toString())) } },
      { $addToSet: { spouses: person._id } }
    );

    person.firstName = firstName || person.firstName;
    person.lastName = lastName || person.lastName;
    person.birthDate = birthDate ? new Date(birthDate) : person.birthDate;
    person.deathDate = deathDate ? new Date(deathDate) : person.deathDate;
    person.gender = gender || person.gender;
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
