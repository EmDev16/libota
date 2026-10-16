// backend/utils/createAdmin.js
//
// Creates an admin user directly in the database (or resets the password of an
// existing one). Use it when you can't log in.
//
// Run it from the project root, the same folder you start the backend from:
//   node backend/utils/createAdmin.js <username> <password>
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Person = require('../models/Person');

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: node backend/utils/createAdmin.js <username> <password>');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/libota');
    console.log('Connected to database:', mongoose.connection.name);
    console.log(
      'Before: users =', await User.countDocuments(),
      ', people =', await Person.countDocuments()
    );

    let user = await User.findOne({ username });
    if (user) {
      console.log(`User "${username}" already exists: resetting the password and making it admin`);
      user.password = password;
      user.role = 'admin';
    } else {
      console.log(`Creating admin "${username}"`);
      user = new User({ username, password, role: 'admin', language: 'en' });
    }

    await user.save();
    console.log('Done. You can now log in with that username and password.');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();