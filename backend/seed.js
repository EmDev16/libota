// Creates the first admin account(s) for a NEW database. It never deletes anything.
//
//   SEED_ADMIN_PASSWORD=<a password> node seed.js
//
// Without SEED_ADMIN_PASSWORD a random password is made and shown once.
// Change it after the first login (Account page).
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('./models/User');
const { passwordProblem } = require('./utils/password');

const seedAdmins = async () => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'yes') {
      console.error('Refusing to run in production. Set ALLOW_SEED=yes if you really mean it.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/libota');
    console.log('MongoDB connected');

    let password = process.env.SEED_ADMIN_PASSWORD;
    let generated = false;
    if (password) {
      const problem = passwordProblem(password);
      if (problem) {
        console.error(`SEED_ADMIN_PASSWORD is not good enough: ${problem}`);
        process.exit(1);
      }
    } else {
      // Letters + digits, so it also passes the password rules
      password = `${crypto.randomBytes(9).toString('base64url')}a1`;
      generated = true;
    }

    const admins = [
      { username: 'admin', role: 'admin', language: 'fr' },
      { username: 'admin2', role: 'admin', language: 'en' }
    ];

    for (const adminData of admins) {
      if (await User.findOne({ username: adminData.username })) {
        console.log(`User ${adminData.username} already exists, skipping...`);
        continue;
      }
      await new User({ ...adminData, password }).save();
      console.log(`Created admin user: ${adminData.username}`);
    }

    if (generated) console.log(`Password for the new admin(s): ${password}  (shown only once)`);
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedAdmins();
