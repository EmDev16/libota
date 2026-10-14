const mongoose = require('mongoose');

const personSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  birthDate: {
    type: Date
  },
  deathDate: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    lowercase: true,
    required: true
  },
  photo: {
    type: String // Path to uploaded photo
  },
  description: {
    type: String,
    default: ''
  },
  parents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Person'
  }],
  spouses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Person'
  }],
  children: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Person'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
personSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Virtual for full name
personSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure JSON output includes virtuals
personSchema.set('toJSON', { virtuals: true });
personSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Person', personSchema);
