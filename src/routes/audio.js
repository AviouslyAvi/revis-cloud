const { Router } = require('express');
const db = require('../db');
const r2 = require('../storage/r2');

const router = Router();

// GET /api/audio/:trackId — returns presigned URL for streaming
router.get('/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const track = db.prepare('SELECT filename FROM tracks WHERE id = ? AND user_id = ?').get(trackId, req.userId);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const url = await r2.getPresignedUrl(track.filename);
  res.json({ url });
});

// GET /api/stream/:filename — returns presigned URL for version/stem audio
router.get('/stream/:filename', async (req, res) => {
  const { filename } = req.params;
  // Verify the file belongs to the user (check across tracks, versions, stems)
  const inTrack = db.prepare('SELECT 1 FROM tracks WHERE filename = ? AND user_id = ?').get(filename, req.userId);
  const inVersion = db.prepare('SELECT 1 FROM versions WHERE filename = ? AND user_id = ?').get(filename, req.userId);
  const inStem = db.prepare('SELECT 1 FROM stems WHERE filename = ? AND user_id = ?').get(filename, req.userId);

  if (!inTrack && !inVersion && !inStem) return res.status(404).json({ error: 'File not found' });

  const url = await r2.getPresignedUrl(filename);
  res.json({ url });
});

module.exports = router;
