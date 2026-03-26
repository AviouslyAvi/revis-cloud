require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { clerkMiddleware } = require('@clerk/express');

// Initialize database (runs schema on first load)
const db = require('./db');

const { requireAuth, ensureUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// === Global Middleware ===
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL || '*']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());
app.use(clerkMiddleware());

// === Static Files (index: false so landing.html handles `/` instead of index.html) ===
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// === Health Check (public) ===
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// === Clerk Publishable Key (public) ===
app.get('/api/clerk-key', (req, res) => {
  res.json({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY });
});

// === User Info (protected) ===
app.get('/api/me', requireAuth(), ensureUser, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json(user);
});

// === Protected API Routes ===
app.use('/api/projects', requireAuth(), ensureUser, require('./routes/projects'));
app.use('/api/tracks', requireAuth(), ensureUser, require('./routes/tracks'));
app.use('/api/tracks/:trackId/versions', requireAuth(), ensureUser, require('./routes/versions'));
app.use('/api/tracks/:trackId/stems', requireAuth(), ensureUser, require('./routes/stems'));
app.use('/api/audio', requireAuth(), ensureUser, require('./routes/audio'));
app.use('/api/download', requireAuth(), ensureUser, require('./routes/download'));

// === Share Routes (mixed public/protected) ===
app.use('/api/share', require('./routes/share'));

// === Public share page ===
app.get('/api/shared/:slug', (req, res) => {
  // Proxy to share route's public handler
  const shareRouter = require('./routes/share');
  req.params.slug = req.params.slug;
  req.url = `/public/${req.params.slug}`;
  shareRouter(req, res);
});

app.post('/api/shared/:slug/play', (req, res) => {
  req.url = `/public/${req.params.slug}/play`;
  require('./routes/share')(req, res);
});

// === Page Routes ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

app.get('/s/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/share.html'));
});

app.get('/sign-in*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/sign-in.html'));
});

app.get('/sign-up*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/sign-up.html'));
});

app.get('/app*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

// === Error Handler ===
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// === Start ===
app.listen(PORT, () => {
  console.log(`\n  ✦ Revis Cloud is running at http://localhost:${PORT}\n`);
});
