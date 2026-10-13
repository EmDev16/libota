require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

// Seed admin users
const seedAdmins = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/libota');
    console.log('MongoDB connected');

    // Clear existing users (optional - comment out if you want to keep existing users)
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create admin users
    const admins = [
      {
        username: 'admin',
        password: 'LibotaAdmin2024!',
        role: 'admin',
        language: 'fr'
      },
      {
        username: 'admin2',
        password: 'LibotaAdmin2024!',
        role: 'admin',
        language: 'en'
      }
    ];

    for (const adminData of admins) {
      const existingUser = await User.findOne({ username: adminData.username });
      if (existingUser) {
        console.log(`User ${adminData.username} already exists, skipping...`);
        continue;
      }

      const user = new User(adminData);
      await user.save();
      console.log(`Created admin user: ${adminData.username}`);
    }

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedAdmins();
