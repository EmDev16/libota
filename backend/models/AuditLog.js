const mongoose = require('mongoose');

// One line per action somebody took (or tried to take) in the app.
// Entries are deleted automatically after a year, so the database stays small.
const RETENTION_SECONDS = 365 * 24 * 60 * 60;

const auditLogSchema = new mongoose.Schema({
  // Who did it. userId stays empty when nobody was logged in (a failed login).
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  username: { type: String, default: '' },
  role: { type: String, default: '' },
  ip: { type: String, default: '' },

  // What they did, e.g. 'person.update', 'auth.login'
  action: { type: String, required: true, index: true },
  status: { type: String, enum: ['success', 'fail'], default: 'success', index: true },

  // What it was done to
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  targetName: { type: String, default: '' },
  message: { type: String, default: '' },

  // The person as it was before and after (only for changes to people); used by "Restore"
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },

  restoredAt: { type: Date, default: null },
  restoredBy: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now, expires: RETENTION_SECONDS }
});

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
