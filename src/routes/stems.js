const { Router } = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const r2 = require('../storage/r2');
const { genId, ALLOWED_EXTENSIONS, getMimeType } = require('../utils/helpers');

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const VALID_STEM_TYPES = ['vocal', 'drums', 'bass', 'guitar', 'synth', 'other'];

// GET /api/tracks/:trackId/stems
router.get('/', (req, res) => {
  const { trackId } = req.params;
  const track = db.prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const stems = db.prepare('SELECT * FROM stems WHERE track_id = ? ORDER BY created_at ASC').all(trackId);
  res.json(stems);
});

// POST /api/tracks/:trackId/stems
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { trackId } = req.params;
    const track = db.prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
    if (!track) return res.status(404).json({ error: 'Track not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const stemName = (req.body.name || '').trim();
    if (!stemName) return res.status(400).json({ error: 'Stem name is required' });

    const stemType = (req.body.type || 'other').trim();
    if (!VALID_STEM_TYPES.includes(stemType)) return res.status(400).json({ error: 'Invalid stem type' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return res.status(400).json({ error: 'Unsupported format' });

    const fileId = genId();
    const r2Key = `${req.userId}/stems/${fileId}${ext}`;
    await r2.uploadFile(r2Key, req.file.buffer, getMimeType(ext));

    const stemId = genId();
    db.prepare(`
      INSERT INTO stems (id, track_id, user_id, name, type, filename, original_name, size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(stemId, trackId, req.userId, stemName, stemType, r2Key, req.file.originalname, req.file.size, req.userName || 'Unknown');

    const stem = db.prepare('SELECT * FROM stems WHERE id = ?').get(stemId);
    res.status(201).json(stem);
  } catch (err) {
    console.error('Stem upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// DELETE /api/tracks/:trackId/stems/:stemId
router.delete('/:stemId', async (req, res) => {
  const { trackId, stemId } = req.params;
  const stem = db.prepare('SELECT * FROM stems WHERE id = ? AND track_id = ? AND user_id = ?').get(stemId, trackId, req.userId);
  if (!stem) return res.status(404).json({ error: 'Not found' });

  await r2.deleteFile(stem.filename);
  db.prepare('DELETE FROM stems WHERE id = ?').run(stemId);
  res.json({ ok: true });
});

module.exports = router;
