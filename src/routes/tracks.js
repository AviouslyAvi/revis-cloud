const { Router } = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const r2 = require('../storage/r2');
const { genId, ALLOWED_EXTENSIONS, getMimeType } = require('../utils/helpers');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB max

// GET /api/tracks
router.get('/', (req, res) => {
  const { projectId } = req.query;
  let tracks;
  if (projectId) {
    tracks = db.prepare('SELECT * FROM tracks WHERE user_id = ? AND project_id = ? ORDER BY "order" ASC').all(req.userId, projectId);
  } else {
    tracks = db.prepare('SELECT * FROM tracks WHERE user_id = ? ORDER BY "order" ASC').all(req.userId);
  }
  res.json(tracks);
});

// POST /api/tracks/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return res.status(400).json({ error: 'Unsupported format' });

    const fileId = genId();
    const r2Key = `${req.userId}/${fileId}${ext}`;
    const contentType = getMimeType(ext);

    // Upload to R2
    await r2.uploadFile(r2Key, req.file.buffer, contentType);

    const projectId = req.body.projectId || null;
    const bpm = req.body.bpm ? parseFloat(req.body.bpm) : null;
    const key = req.body.key || null;

    // Calculate order
    const maxOrder = db.prepare('SELECT MAX("order") as max_order FROM tracks WHERE user_id = ? AND project_id IS ?')
      .get(req.userId, projectId);
    const order = (maxOrder?.max_order ?? -1) + 1;

    const trackId = genId();
    const trackName = path.basename(req.file.originalname, ext);

    db.prepare(`
      INSERT INTO tracks (id, user_id, project_id, name, filename, original_name, size, bpm, key, "order", created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(trackId, req.userId, projectId, trackName, r2Key, req.file.originalname, req.file.size, bpm, key, order);

    // Auto-create v1 version
    db.prepare(`
      INSERT INTO versions (id, track_id, user_id, version_number, filename, original_name, size, comment, uploaded_by, is_current, created_at)
      VALUES (?, ?, ?, 1, ?, ?, ?, 'Initial upload', ?, 1, datetime('now'))
    `).run(genId(), trackId, req.userId, r2Key, req.file.originalname, req.file.size, req.userName || 'Unknown');

    const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
    res.status(201).json(track);
  } catch (err) {
    console.error('Track upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// PUT /api/tracks/reorder
router.put('/reorder', (req, res) => {
  const { trackIds } = req.body;
  if (!trackIds || !Array.isArray(trackIds)) return res.status(400).json({ error: 'trackIds required' });

  const stmt = db.prepare('UPDATE tracks SET "order" = ? WHERE id = ? AND user_id = ?');
  const updateMany = db.transaction((ids) => {
    ids.forEach((id, i) => stmt.run(i, id, req.userId));
  });
  updateMany(trackIds);
  res.json({ ok: true });
});

// PUT /api/tracks/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!track) return res.status(404).json({ error: 'Not found' });

  const { name, projectId, duration, bpm, key } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (projectId !== undefined) { updates.push('project_id = ?'); values.push(projectId); }
  if (duration !== undefined) { updates.push('duration = ?'); values.push(duration); }
  if (bpm !== undefined) { updates.push('bpm = ?'); values.push(bpm); }
  if (key !== undefined) { updates.push('key = ?'); values.push(key); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values, id, req.userId);
  }

  const updated = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/tracks/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!track) return res.status(404).json({ error: 'Not found' });

  // Collect all R2 keys to delete
  const filesToDelete = [track.filename];
  const versions = db.prepare('SELECT filename FROM versions WHERE track_id = ?').all(id);
  const stems = db.prepare('SELECT filename FROM stems WHERE track_id = ?').all(id);
  versions.forEach(v => filesToDelete.push(v.filename));
  stems.forEach(s => filesToDelete.push(s.filename));

  const uniqueFiles = [...new Set(filesToDelete)];
  await r2.deleteFiles(uniqueFiles);

  // CASCADE handles versions, stems, share_links
  db.prepare('DELETE FROM tracks WHERE id = ? AND user_id = ?').run(id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
