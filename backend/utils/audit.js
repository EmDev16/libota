// Writing to the activity log. A problem with the log must never break the action itself,
// so nothing in here throws.
const AuditLog = require('../models/AuditLog');
const Person = require('../models/Person');

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const idOf = (value) => String((value && value._id) || value);
const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

// A plain copy of a person, taken before/after a change. Dates are stored as yyyy-mm-dd, and the
// names of the linked people are kept so the log stays readable if those people are deleted later.
async function personSnapshot(person) {
  if (!person) return null;
  const p = typeof person.toObject === 'function' ? person.toObject({ virtuals: false }) : person;
  const list = (values) => (values || []).map(idOf);
  const snap = {
    _id: idOf(p._id),
    firstName: p.firstName,
    lastName: p.lastName,
    birthDate: day(p.birthDate),
    deathDate: day(p.deathDate),
    gender: p.gender,
    description: p.description || '',
    photo: p.photo || null,
    parents: list(p.parents),
    spouses: list(p.spouses),
    formerSpouses: list(p.formerSpouses),
    children: list(p.children),
    createdBy: p.createdBy ? idOf(p.createdBy) : null
  };
  try {
    const linked = [...new Set([...snap.parents, ...snap.spouses, ...snap.children])];
    const found = linked.length
      ? await Person.find({ _id: { $in: linked } }).select('firstName lastName')
      : [];
    snap.linkNames = Object.fromEntries(found.map((f) => [idOf(f), `${f.firstName} ${f.lastName}`]));
  } catch {
    snap.linkNames = {};
  }
  return snap;
}

const personName = (snap) => (snap ? `${snap.firstName} ${snap.lastName}` : '');

// entry: { action, status?, actor?, username?, targetType?, targetId?, targetName?, message?, before?, after? }
async function logEvent(req, entry) {
  try {
    const actor = entry.actor || req.user || null;
    await AuditLog.create({
      userId: actor && actor._id ? actor._id : null,
      username: text(entry.username || (actor && actor.username) || ''),
      role: (actor && actor.role) || '',
      ip: text(req.ip, 64),
      action: entry.action,
      status: entry.status || 'success',
      targetType: entry.targetType || '',
      targetId: entry.targetId ? String(entry.targetId) : '',
      targetName: text(entry.targetName),
      message: text(entry.message, 300),
      before: entry.before || null,
      after: entry.after || null
    });
  } catch (error) {
    console.error('Writing to the activity log failed:', error.message);
  }
}

module.exports = { logEvent, personSnapshot, personName };
