const { Router } = require('express');
const path = require('path');
const db = require('../db');
const r2 = require('../storage/r2');
const { buildZip } = require('../utils/zip');

const router = Router();

// POST /api/download — bulk download tracks or stems as ZIP
router.post('/', async (req, res) => {
  try {
    const { ids, type } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No ids provided' });
    }

    const files = [];

    if (type === 'stems') {
      for (const id of ids) {
        const stem = db.prepare('SELECT * FROM stems WHERE id = ? AND user_id = ?').get(id, req.userId);
        if (!stem) continue;
        try {
          const data = await r2.getFileBuffer(stem.filename);
          files.push({ name: stem.name + path.extname(stem.filename), data });
        } catch (e) {
          console.error('Failed to fetch stem from R2:', stem.filename, e.message);
        }
      }
    } else {
      for (const id of ids) {
        const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(id, req.userId);
        if (!track) continue;
        try {
          const data = await r2.getFileBuffer(track.filename);
          files.push({ name: track.name + path.extname(track.filename), data });
        } catch (e) {
          console.error('Failed to fetch track from R2:', track.filename, e.message);
        }
      }
    }

    if (files.length === 0) return res.status(404).json({ error: 'No files found' });

    const zipBuffer = buildZip(files);
    const zipName = type === 'stems' ? 'stems.zip' : 'tracks.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

module.exports = router;
