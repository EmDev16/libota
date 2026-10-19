// Builds the Express app without connecting to a database or opening a port,
// so tests can load it. server.js does the connecting and listening.
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const personRoutes = require('./routes/person');
const treeRoutes = require('./routes/tree');
const exportRoutes = require('./routes/export');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/person', personRoutes);
app.use('/api/tree', treeRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;