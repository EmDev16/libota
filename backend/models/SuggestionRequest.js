const mongoose = require('mongoose');

// One submission from a member: a few suggestions sent together. An admin approves or rejects
// every suggestion on its own. Deleted automatically after a year, like the activity log.
const RETENTION_SECONDS = 365 * 24 * 60 * 60;

const itemSchema = new mongoose.Schema({
  // correction: add or fix information about a person who is in the tree
  // newPerson : somebody is missing; me: the member is missing themselves
  type: { type: String, enum: ['correction', 'newPerson', 'me', 'photo'], required: true },
  note: { type: String, default: '' },
  photo: { type: String, default: null },

  // correction
  personId: { type: mongoose.Schema.Types.ObjectId, default: null },
  personName: { type: String, default: '' },
  changes: { type: mongoose.Schema.Types.Mixed, default: null }, // { firstName, lastName, birthDate, deathDate, gender, description }
  previous: { type: mongoose.Schema.Types.Mixed, default: null }, // the old values of what an approved correction changed

  // photo: a photo for the gallery { caption, album, tags, takenYear, takenDate, width, height }
  gallery: { type: mongoose.Schema.Types.Mixed, default: null },

  // newPerson / me
  newPerson: { type: mongoose.Schema.Types.Mixed, default: null }, // { firstName, lastName, birthDate, deathDate, gender, description }
  relation: { type: String, default: '' },

  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectReason: { type: String, default: '' },
  handledAt: { type: Date, default: null },
  handledBy: { type: String, default: '' },
  resultPersonId: { type: mongoose.Schema.Types.ObjectId, default: null }
});

const requestSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  account: { type: String, default: '' }, // the account's username
  senderName: { type: String, default: '' }, // who of the family typed it
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now, expires: RETENTION_SECONDS }
});

module.exports = mongoose.model('SuggestionRequest', requestSchema);
