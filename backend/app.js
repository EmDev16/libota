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

// Behind Render's proxy the real visitor address is in a header; needed for the login limit
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS_ORIGIN (comma separated) limits which websites may call the API.
// Without it every origin is allowed, which is fine for development.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

// Basic security headers
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=15552000'
  });
  next();
});

// Safety net: whatever a route says about a server error, the browser only gets a general message.
// (The real reason is written to the server log.)
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && body.error) {
      console.error(`${req.method} ${req.originalUrl} -> ${res.statusCode}:`, body.error);
      return json({ error: 'Something went wrong' });
    }
    return json(body);
  };
  next();
});

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

// Anything that went wrong outside a route's own try/catch, e.g. a request body that is not valid JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : 'Invalid request' });
});

module.exports = app;