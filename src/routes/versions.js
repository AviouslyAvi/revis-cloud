const { Router } = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const r2 = require('../storage/r2');
const { genId, ALLOWED_EXTENSIONS, getMimeType } = require('../utils/helpers');

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// GET /api/tracks/:trackId/versions
router.get('/', (req, res) => {
  const { trackId } = req.params;
  // Verify track belongs to user
  const track = db.prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const versions = db.prepare('SELECT * FROM versions WHERE track_id = ? ORDER BY version_number DESC').all(trackId);
  res.json(versions);
});

// POST /api/tracks/:trackId/versions
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { trackId } = req.params;
    const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
    if (!track) return res.status(404).json({ error: 'Track not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const comment = (req.body.comment || '').trim();
    if (!comment) return res.status(400).json({ error: 'Comment is required' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return res.status(400).json({ error: 'Unsupported format' });

    const fileId = genId();
    const r2Key = `${req.userId}/${fileId}${ext}`;
    await r2.uploadFile(r2Key, req.file.buffer, getMimeType(ext));

    // Mark all existing versions as not current
    db.prepare('UPDATE versions SET is_current = 0 WHERE track_id = ?').run(trackId);

    const maxVer = db.prepare('SELECT MAX(version_number) as max_ver FROM versions WHERE track_id = ?').get(trackId);
    const versionNumber = (maxVer?.max_ver || 0) + 1;

    const versionId = genId();
    db.prepare(`
      INSERT INTO versions (id, track_id, user_id, version_number, filename, original_name, size, comment, uploaded_by, is_current, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(versionId, trackId, req.userId, versionNumber, r2Key, req.file.originalname, req.file.size, comment, req.userName || 'Unknown');

    // Update parent track
    db.prepare("UPDATE tracks SET filename = ?, original_name = ?, size = ?, updated_at = datetime('now') WHERE id = ?")
      .run(r2Key, req.file.originalname, req.file.size, trackId);

    const version = db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId);
    res.status(201).json(version);
  } catch (err) {
    console.error('Version upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// PUT /api/tracks/:trackId/versions/:versionId/activate
router.put('/:versionId/activate', (req, res) => {
  const { trackId, versionId } = req.params;
  const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const version = db.prepare('SELECT * FROM versions WHERE id = ? AND track_id = ?').get(versionId, trackId);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  db.prepare('UPDATE versions SET is_current = 0 WHERE track_id = ?').run(trackId);
  db.prepare('UPDATE versions SET is_current = 1 WHERE id = ?').run(versionId);
  db.prepare("UPDATE tracks SET filename = ?, original_name = ?, size = ?, updated_at = datetime('now') WHERE id = ?")
    .run(version.filename, version.original_name, version.size, trackId);

  const updated = db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId);
  res.json(updated);
});

module.exports = router;
