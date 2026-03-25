const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const r2 = require('../storage/r2');
const { genId, hashPass } = require('../utils/helpers');
const { requireAuth, ensureUser } = require('../middleware/auth');

const router = Router();

// === Protected routes (require auth) ===

// POST /api/share — create share link
router.post('/', requireAuth(), ensureUser, (req, res) => {
  const { trackId, password } = req.body;
  const track = db.prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  // Limit: one share link per track
  const existing = db.prepare('SELECT * FROM share_links WHERE track_id = ? AND user_id = ?').get(trackId, req.userId);
  if (existing) return res.status(400).json({ error: 'Share link already exists for this track', link: existing });

  const link = {
    id: genId(),
    track_id: trackId,
    user_id: req.userId,
    slug: crypto.randomBytes(6).toString('base64url'),
    password_hash: password ? hashPass(password) : null,
  };

  db.prepare('INSERT INTO share_links (id, track_id, user_id, slug, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run(link.id, link.track_id, link.user_id, link.slug, link.password_hash);

  const created = db.prepare('SELECT * FROM share_links WHERE id = ?').get(link.id);
  res.status(201).json({ ...created, url: `/s/${link.slug}` });
});

// GET /api/share — list share links
router.get('/', requireAuth(), ensureUser, (req, res) => {
  const { trackId } = req.query;
  let links;
  if (trackId) {
    links = db.prepare('SELECT * FROM share_links WHERE user_id = ? AND track_id = ?').all(req.userId, trackId);
  } else {
    links = db.prepare('SELECT * FROM share_links WHERE user_id = ?').all(req.userId);
  }
  res.json(links);
});

// DELETE /api/share/:id — delete share link
router.delete('/:id', requireAuth(), ensureUser, (req, res) => {
  const { id } = req.params;
  const link = db.prepare('SELECT * FROM share_links WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!link) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM share_links WHERE id = ?').run(id);
  res.json({ ok: true });
});

// === Public routes (no auth) ===

// GET /api/shared/:slug — get shared track metadata
router.get('/public/:slug', (req, res) => {
  const { slug } = req.params;
  const link = db.prepare('SELECT * FROM share_links WHERE slug = ?').get(slug);
  if (!link) return res.status(404).json({ error: 'Not found' });

  const track = db.prepare('SELECT name FROM tracks WHERE id = ?').get(link.track_id);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  res.json({
    trackName: track.name,
    hasPassword: !!link.password_hash,
    slug: link.slug,
  });
});

// POST /api/shared/:slug/play — verify password & return presigned audio URL
router.post('/public/:slug/play', async (req, res) => {
  const { slug } = req.params;
  const { password } = req.body;
  const link = db.prepare('SELECT * FROM share_links WHERE slug = ?').get(slug);
  if (!link) return res.status(404).json({ error: 'Not found' });

  if (link.password_hash && hashPass(password || '') !== link.password_hash) {
    return res.status(403).json({ error: 'Wrong password' });
  }

  // Increment listens
  db.prepare('UPDATE share_links SET listens = listens + 1 WHERE id = ?').run(link.id);

  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(link.track_id);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const audioUrl = await r2.getPresignedUrl(track.filename);
  res.json({ trackId: track.id, trackName: track.name, audioUrl });
});

module.exports = router;
