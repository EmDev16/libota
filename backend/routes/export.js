const express = require('express');
const Person = require('../models/Person');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Export all data as JSON
router.get('/json', adminAuth, async (req, res) => {
  try {
    const people = await Person.find()
      .populate('parents', 'firstName lastName birthDate deathDate gender')
      .populate('spouses', 'firstName lastName birthDate deathDate gender')
      .populate('children', 'firstName lastName birthDate deathDate gender')
      .populate('createdBy', 'username');

    const users = await User.find().select('-password');

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      people: people.map(p => ({
        _id: p._id.toString(),
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        deathDate: p.deathDate,
        gender: p.gender,
        photo: p.photo,
        description: p.description,
        parents: p.parents.map(parent => parent._id.toString()),
        spouses: p.spouses.map(spouse => spouse._id.toString()),
        children: p.children.map(child => child._id.toString()),
        createdBy: p.createdBy ? p.createdBy.username : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      })),
      users: users.map(u => ({
        _id: u._id.toString(),
        username: u.username,
        role: u.role,
        language: u.language,
        createdAt: u.createdAt
      }))
    };

    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import data from JSON
router.post('/json', adminAuth, async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !data.people) {
      return res.status(400).json({ error: 'Invalid import data format' });
    }

    // Clear existing data (optional - you might want to merge instead)
    await Person.deleteMany({});
    await User.deleteMany({});

    // Import users first
    if (data.users) {
      for (const userData of data.users) {
        const user = new User({
          username: userData.username,
          password: 'ChangeMe123', // Default password for imported users
          role: userData.role,
          language: userData.language,
          createdAt: userData.createdAt
        });
        await user.save();
      }
    }

    // Create a map of old IDs to new IDs
    const idMap = new Map();

    // Import people
    for (const personData of data.people) {
      const person = new Person({
        firstName: personData.firstName,
        lastName: personData.lastName,
        birthDate: personData.birthDate,
        deathDate: personData.deathDate,
        gender: personData.gender,
        photo: personData.photo,
        description: personData.description,
        parents: [], // Will update after all people are created
        spouses: [], // Will update after all people are created
        children: [], // Will update after all people are created
        createdAt: personData.createdAt,
        updatedAt: personData.updatedAt
      });

      // Find or create the creator user
      if (personData.createdBy) {
        const creator = await User.findOne({ username: personData.createdBy });
        if (creator) {
          person.createdBy = creator._id;
        } else {
          // Default to first admin user
          const admin = await User.findOne({ role: 'admin' });
          person.createdBy = admin ? admin._id : null;
        }
      } else {
        const admin = await User.findOne({ role: 'admin' });
        person.createdBy = admin ? admin._id : null;
      }

      await person.save();
      idMap.set(personData._id, person._id);
    }

    // Update relationships with new IDs
    for (const personData of data.people) {
      const newId = idMap.get(personData._id);
      if (!newId) continue;

      const person = await Person.findById(newId);

      // Map old parent IDs to new IDs
      const newParentIds = personData.parents
        .map(oldId => idMap.get(oldId))
        .filter(id => id);

      // Map old spouse IDs to new IDs
      const newSpouseIds = personData.spouses
        .map(oldId => idMap.get(oldId))
        .filter(id => id);

      // Map old child IDs to new IDs
      const newChildIds = personData.children
        .map(oldId => idMap.get(oldId))
        .filter(id => id);

      person.parents = newParentIds;
      person.spouses = newSpouseIds;
      person.children = newChildIds;

      await person.save();
    }

    res.json({
      message: 'Data imported successfully',
      peopleImported: data.people.length,
      usersImported: data.users ? data.users.length : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
