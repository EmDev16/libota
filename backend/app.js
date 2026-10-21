// Builds the Express app without connecting to a database or opening a port,
// so tests can load it. server.js does the connecting and listening.
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const personRoutes = require('./routes/person');
const treeRoutes = require('./routes/tree');
const exportRoutes = require('./routes/export');
const { getUploadDir } = require('./utils/photoStorage');

const app = express();

// CORS_ORIGIN (comma separated) limits which websites may call the API.
// Without it every origin is allowed, which is fine for development.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

// Middleware
app.use(cors(allowedOrigins && allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Photos that are stored on disk (photos on Cloudinary are served by Cloudinary)
app.use('/uploads', express.static(getUploadDir()));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/person', personRoutes);
app.use('/api/tree', treeRoutes);
app.use('/api/export', exportRoutes);

// Health check (also used by the hosting platform to see that the server is alive)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;