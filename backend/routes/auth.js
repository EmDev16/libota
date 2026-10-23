const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');
const {
  loginLimiter,
  recordLoginFailure,
  clearLoginFailures
} = require('../middleware/rateLimit');
const { getJwtSecret } = require('../utils/config');
const { passwordProblem } = require('../utils/password');
const { logEvent } = require('../utils/audit');

const router = express.Router();

const LANGUAGES = ['fr', 'en', 'ln', 'nl'];
const ROLES = ['admin', 'member'];
const isText = (value) => typeof value === 'string';

// Compared against when the username does not exist, so the answer takes as long as a real one
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const signToken = (user) => jwt.sign({ userId: user._id }, getJwtSecret(), { expiresIn: '7d' });

const publicUser = (user) => ({
  id: user._id,
  username: user.username,
  role: user.role,
  language: user.language,
  showStats: user.role === 'admin' || user.showStats === true
});

// The details stay in the server log; the browser only gets a general message
const serverError = (res, error) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong' });
};

// Register new user (admin only)
router.post('/register', adminAuth, async (req, res) => {
  try {
    const { username, password, role, language, showStats } = req.body;

    // Only plain text is accepted: an object such as { "$gt": "" } must never reach the database query
    if (!isText(username) || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const problem = passwordProblem(password);
    if (problem) {
      return res.status(400).json({ error: problem });
    }
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const user = new User({
      username: username.trim(),
      password,
      role: role || 'member',
      language: LANGUAGES.includes(language) ? language : 'en',
      showStats: showStats === true
    });

    await user.save();
    await logEvent(req, { action: 'auth.register', targetType: 'user', targetId: user._id, targetName: user.username, message: `role: ${user.role}` });

    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    await logEvent(req, { action: 'auth.register', status: 'fail', targetType: 'user', message: 'Server error' });
    serverError(res, error);
  }
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, language } = req.body;

    if (!isText(username) || !isText(password)) {
      await logEvent(req, { action: 'auth.login', status: 'fail', message: 'Invalid request' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await User.findOne({ username });
    const isMatch = user
      ? await user.comparePassword(password)
      : await bcrypt.compare(password, DUMMY_HASH).then(() => false);

    if (!user || !isMatch) {
      recordLoginFailure(req, username);
      await logEvent(req, { action: 'auth.login', status: 'fail', username, message: user ? 'Wrong password' : 'Unknown username' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearLoginFailures(req, username);

    // Update language if provided
    if (language && LANGUAGES.includes(language)) {
      user.language = language;
      await user.save();
    }

    await logEvent(req, { action: 'auth.login', actor: user, targetType: 'user', targetId: user._id, targetName: user.username });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    serverError(res, error);
  }
});

// Get current user
router.get('/me', auth, (req, res) => {
  res.json({
    id: req.user._id,
    username: req.user.username,
    role: req.user.role,
    language: req.user.language,
    showStats: req.user.role === 'admin' || req.user.showStats === true
  });
});

// Change your own password (admins only: one member account can be shared by several people).
// Every older login stops working; the answer holds a fresh token.
router.put('/password', adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!isText(currentPassword) || !isText(newPassword)) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(currentPassword))) {
      await logEvent(req, { action: 'auth.password', status: 'fail', targetType: 'user', targetId: req.user._id, targetName: req.user.username, message: 'Wrong current password' });
      // 400 and not 401: the browser logs you out on a 401, and you are still logged in here
      return res.status(400).json({ error: 'Current password is not correct' });
    }

    const problem = passwordProblem(newPassword);
    if (problem) {
      return res.status(400).json({ error: problem });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'The new password must be different' });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    await logEvent(req, { action: 'auth.password', targetType: 'user', targetId: user._id, targetName: user.username });

    res.json({ message: 'Password changed', token: signToken(user) });
  } catch (error) {
    serverError(res, error);
  }
});

// Get all users (admin only)
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password -passwordChangedAt');
    res.json(users);
  } catch (error) {
    serverError(res, error);
  }
});

// Set a new password for someone else, e.g. when they forgot theirs (admin only).
// They are logged out everywhere and must use the new password.
router.put('/users/:id/password', adminAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    const problem = passwordProblem(newPassword);
    if (problem) {
      return res.status(400).json({ error: problem });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    await logEvent(req, { action: 'auth.reset-password', targetType: 'user', targetId: user._id, targetName: user.username });

    res.json({ message: 'Password reset' });
  } catch (error) {
    // An id that is not an ObjectId fails here as well
    if (error.name === 'CastError') return res.status(404).json({ error: 'User not found' });
    serverError(res, error);
  }
});

// Choose whether an account sees the family statistics (admin only)
router.put('/users/:id/stats', adminAuth, async (req, res) => {
  try {
    if (typeof req.body.showStats !== 'boolean') {
      return res.status(400).json({ error: 'showStats must be true or false' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { showStats: req.body.showStats },
      { new: true }
    ).select('-password -passwordChangedAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await logEvent(req, {
      action: 'auth.stats',
      targetType: 'user',
      targetId: user._id,
      targetName: user.username,
      message: req.body.showStats ? 'statistics on' : 'statistics off'
    });
    res.json(user);
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ error: 'User not found' });
    serverError(res, error);
  }
});

// Delete user (admin only)
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deleting yourself is how a family ends up without any admin
    if (String(user._id) === String(req.user._id)) {
      await logEvent(req, { action: 'auth.delete-user', status: 'fail', targetType: 'user', targetId: user._id, targetName: user.username, message: 'Own account' });
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);
    await logEvent(req, { action: 'auth.delete-user', targetType: 'user', targetId: user._id, targetName: user.username, message: `role: ${user.role}` });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ error: 'User not found' });
    serverError(res, error);
  }
});

module.exports = router;