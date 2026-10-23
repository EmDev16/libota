// Shared setup for the API tests: a throwaway in-memory MongoDB, and small helpers to
// create users, people and login tokens.

// Must be set before the app handles requests
process.env.JWT_SECRET = 'test-secret';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Photos go to a temporary folder, and never to Cloudinary, whatever is in your environment
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libota-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;
delete process.env.CLOUDINARY_URL;

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Person = require('../models/Person');
const AuditLog = require('../models/AuditLog');
const SuggestionRequest = require('../models/SuggestionRequest');
const GalleryPhoto = require('../models/GalleryPhoto');

let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
}

async function clearDb() {
  await Promise.all([User.deleteMany({}), Person.deleteMany({}), AuditLog.deleteMany({}), SuggestionRequest.deleteMany({}), GalleryPhoto.deleteMany({})]);
  for (const name of fs.readdirSync(uploadsDir)) fs.unlinkSync(path.join(uploadsDir, name));
}

// The password is hashed by the User model, like for a real user
async function createUser(username, role = 'member', password = 'Secret123') {
  const user = new User({ username, password, role });
  await user.save();
  return user;
}

const tokenFor = (user) =>
  jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

const createPerson = (createdBy, extra = {}) =>
  Person.create({
    firstName: 'Anna',
    lastName: 'Test',
    gender: 'female',
    createdBy: createdBy._id,
    ...extra
  });

module.exports = { startDb, stopDb, clearDb, createUser, createPerson, tokenFor, uploadsDir };