const express = require('express');
const mongoose = require('mongoose');
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

// Ids can be plain strings, ObjectIds or populated objects ({ _id: ... })
const toId = (v) => (v && typeof v === 'object' ? String(v._id ?? v.id ?? v.$oid) : String(v));

// Import data from JSON
// body: { data: { people: [...], users?: [...] }, mode?: 'add' | 'replace' }
//   add     (default) adds the people to the existing data, deletes nothing
//   replace deletes all existing people AFTER the import worked, and re-creates
//           users from the file that do not exist yet. Existing users are never deleted.
router.post('/json', adminAuth, async (req, res) => {
  try {
    const { data, mode = 'add' } = req.body || {};

    if (!data || !Array.isArray(data.people) || data.people.length === 0) {
      return res.status(400).json({ error: 'Invalid import data format' });
    }
    if (!['add', 'replace'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "add" or "replace"' });
    }
    if (data.people.some(p => !p || !p.firstName)) {
      return res.status(400).json({ error: 'Every person needs at least a firstName' });
    }

    // Every imported person gets a fresh MongoDB id, so ids in the file can never
    // clash with existing data. Relationships are rewritten to the new ids.
    const keyOf = (p, i) => (p._id ? toId(p._id) : `row-${i}`);
    const idMap = new Map();
    const rel = new Map();
    data.people.forEach((p, i) => {
      const key = keyOf(p, i);
      idMap.set(key, new mongoose.Types.ObjectId());
      rel.set(key, { parents: new Set(), children: new Set(), spouses: new Set() });
    });

    // Make parent <-> child and spouse <-> spouse links two-way, ignoring unknown ids
    data.people.forEach((p, i) => {
      const key = keyOf(p, i);
      const known = (list) => (list || []).map(toId).filter(o => rel.has(o) && o !== key);

      known(p.parents).forEach(o => {
        rel.get(key).parents.add(o);
        rel.get(o).children.add(key);
      });
      known(p.children).forEach(o => {
        rel.get(key).children.add(o);
        rel.get(o).parents.add(key);
      });
      known(p.spouses).forEach(o => {
        rel.get(key).spouses.add(o);
        rel.get(o).spouses.add(key);
      });
    });

    // Restoring a backup: re-create users that are missing (never deletes users)
    let usersImported = 0;
    if (mode === 'replace' && Array.isArray(data.users)) {
      for (const userData of data.users) {
        if (!userData.username) continue;
        if (await User.findOne({ username: userData.username })) continue;
        await new User({
          username: userData.username,
          password: 'ChangeMe123', // default password for re-created users
          role: userData.role,
          language: userData.language
        }).save();
        usersImported++;
      }
    }

    // Who gets credited as creator: the person from the file if that user exists,
    // otherwise the admin doing the import
    const existingUsers = await User.find().select('username');
    const creatorByName = new Map(existingUsers.map(u => [u.username, u._id]));
    const requester = req.user || {};
    const fallbackCreator =
      requester._id ||
      requester.id ||
      requester.userId ||
      req.userId ||
      (await User.findOne({ role: 'admin' }))?._id ||
      null;

    if (!fallbackCreator) {
      // No people have been inserted or deleted at this point
      return res.status(400).json({
        error: 'Could not find an admin user to credit as creator of the imported people'
      });
    }

    const toNew = (set) => [...set].map(o => idMap.get(o));

    const docs = data.people.map((p, i) => {
      const key = keyOf(p, i);
      const r = rel.get(key);
      const doc = {
        _id: idMap.get(key),
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        deathDate: p.deathDate,
        gender: p.gender,
        photo: p.photo,
        description: p.description,
        parents: toNew(r.parents),
        spouses: toNew(r.spouses),
        children: toNew(r.children),
        createdBy: creatorByName.get(p.createdBy) || fallbackCreator
      };
      if (p.createdAt) doc.createdAt = p.createdAt;
      if (p.updatedAt) doc.updatedAt = p.updatedAt;
      return doc;
    });

    // Insert first. In replace mode the old people are only deleted after the insert
    // worked, so a failed import never leaves you with an empty database.
    const inserted = await Person.insertMany(docs);

    if (mode === 'replace') {
      const newIds = inserted.map(d => d._id);
      await Person.deleteMany({ _id: { $nin: newIds } });
    }

    res.json({
      message: 'Data imported successfully',
      imported: inserted.length,
      peopleImported: inserted.length,
      usersImported,
      mode
    });
  } catch (error) {
    // A person that does not fit the Person model (for example no last name) is a problem
    // with the file, not with the server. Nothing was inserted in that case.
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;