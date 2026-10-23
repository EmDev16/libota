// The activity log (admin only): who did what, when, and whether it worked.
const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { adminAuth } = require('../middleware/auth');
const { logEvent } = require('../utils/audit');
const { restoreEntry, RestoreError } = require('../utils/personRestore');

const router = express.Router();

const RESTORABLE = ['person.create', 'person.update', 'person.delete'];
const FIELDS = ['firstName', 'lastName', 'birthDate', 'deathDate', 'gender', 'description', 'photo', 'parents', 'spouses', 'formerSpouses'];
const LINKS = ['parents', 'spouses', 'formerSpouses'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ddmmyyyy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// What changed in an update, in words a person can read
const diff = (before, after) => {
  if (!before || !after) return [];
  const names = { ...(before.linkNames || {}), ...(after.linkNames || {}) };
  const show = (field, snap) => {
    const value = snap[field];
    if (LINKS.includes(field)) return (value || []).map((id) => names[id] || '?').join(', ');
    if (field === 'birthDate' || field === 'deathDate') return ddmmyyyy(value);
    if (field === 'photo') return value ? 'photo' : '';
    return value == null ? '' : String(value);
  };
  const changes = [];
  for (const field of FIELDS) {
    const a = LINKS.includes(field) ? [...(before[field] || [])].sort().join() : before[field] ?? '';
    const b = LINKS.includes(field) ? [...(after[field] || [])].sort().join() : after[field] ?? '';
    if (a !== b) changes.push({ field, from: show(field, before), to: show(field, after) });
  }
  return changes;
};

const view = (e) => ({
  id: e._id,
  createdAt: e.createdAt,
  username: e.username,
  role: e.role,
  userId: e.userId,
  ip: e.ip,
  action: e.action,
  status: e.status,
  targetType: e.targetType,
  targetId: e.targetId,
  targetName: e.targetName,
  message: e.message,
  changes: e.action === 'person.update' ? diff(e.before, e.after) : [],
  restoredAt: e.restoredAt,
  restoredBy: e.restoredBy,
  canRestore:
    e.status === 'success' &&
    !e.restoredAt &&
    RESTORABLE.includes(e.action) &&
    !!(e.action === 'person.create' ? e.after : e.before)
});

// GET /api/audit?page=1&limit=50&action=person.update&status=fail&q=maria
router.get('/', adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = {};
    if (typeof req.query.action === 'string' && req.query.action) filter.action = req.query.action;
    if (req.query.status === 'success' || req.query.status === 'fail') filter.status = req.query.status;
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 60)), 'i');
      filter.$or = [{ username: rx }, { targetName: rx }, { ip: rx }, { message: rx }];
    }

    const [total, entries] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);
    res.json({ entries: entries.map(view), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error('Reading the activity log failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Undo one change to a person
router.post('/:id/restore', adminAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Entry not found' });
    const entry = await AuditLog.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.status !== 'success' || !RESTORABLE.includes(entry.action)) {
      return res.status(400).json({ error: 'This entry cannot be restored' });
    }
    if (entry.restoredAt) return res.status(409).json({ error: 'This entry was already restored' });

    let result;
    try {
      result = await restoreEntry(entry, req.user);
    } catch (error) {
      if (error instanceof RestoreError) {
        await logEvent(req, { action: 'log.restore', status: 'fail', targetType: 'person', targetId: entry.targetId, targetName: entry.targetName, message: error.message });
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
    }

    entry.restoredAt = new Date();
    entry.restoredBy = req.user.username;
    await entry.save();
    await logEvent(req, {
      action: result.action,
      targetType: 'person',
      targetId: result.targetId,
      targetName: result.targetName,
      message: `Restored from log entry ${entry._id}`,
      before: result.before,
      after: result.after
    });
    res.json({ message: 'Restored', note: result.note });
  } catch (error) {
    console.error('Restore failed:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
