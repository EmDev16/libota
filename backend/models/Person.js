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
  // Only the year of the birth / death date is reliable ("around 1930"): the date is kept as 1 January
  birthApprox: {
    type: Boolean,
    default: false
  },
  deathApprox: {
    type: Boolean,
    default: false
  },
  // Known to be deceased, also when no death date is known (always true when there is a death date)
  deceased: {
    type: Boolean,
    default: false
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
  // Partners from `spouses` whose relationship has ended (divorce, separation).
  // The order of `spouses` is the order of the relationships: first partner first.
  formerSpouses: [{
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