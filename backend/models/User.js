const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  language: {
    type: String,
    enum: ['fr', 'en', 'ln', 'nl'],
    default: 'en'
  },
  // Whether this account sees the family statistics on the dashboard (admins always do)
  showStats: {
    type: Boolean,
    default: false
  },
  // Which hidden gallery tags this account may see. Photos without hidden tags are open to everybody.
  // galleryAll lets the account see every photo (admins always do).
  galleryAll: {
    type: Boolean,
    default: false
  },
  galleryTags: {
    type: [String],
    default: []
  },
  // Set when the password changes; tokens made before this moment stop working
  passwordChangedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
