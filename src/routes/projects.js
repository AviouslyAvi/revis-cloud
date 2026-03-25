const { Router } = require('express');
const db = require('../db');
const { genId } = require('../utils/helpers');

const router = Router();

// GET /api/projects
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(projects);
});

// POST /api/projects
router.post('/', (req, res) => {
  const { name, color } = req.body;
  const project = {
    id: genId(),
    user_id: req.userId,
    name: name || 'New Project',
    color: color || '#6366f1',
  };
  db.prepare('INSERT INTO projects (id, user_id, name, color) VALUES (?, ?, ?, ?)').run(project.id, project.user_id, project.name, project.color);
  const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  res.status(201).json(created);
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const proj = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!proj) return res.status(404).json({ error: 'Not found' });

  const { name, color } = req.body;
  if (name !== undefined) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
  if (color !== undefined) db.prepare('UPDATE projects SET color = ? WHERE id = ?').run(color, id);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const proj = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!proj) return res.status(404).json({ error: 'Not found' });

  // Get all files to delete from R2
  const r2 = require('../storage/r2');
  const tracks = db.prepare('SELECT * FROM tracks WHERE project_id = ? AND user_id = ?').all(id, req.userId);
  const trackIds = tracks.map(t => t.id);

  const filesToDelete = [];
  tracks.forEach(t => filesToDelete.push(t.filename));
  if (trackIds.length > 0) {
    const placeholders = trackIds.map(() => '?').join(',');
    const versions = db.prepare(`SELECT filename FROM versions WHERE track_id IN (${placeholders})`).all(...trackIds);
    const stems = db.prepare(`SELECT filename FROM stems WHERE track_id IN (${placeholders})`).all(...trackIds);
    versions.forEach(v => filesToDelete.push(v.filename));
    stems.forEach(s => filesToDelete.push(s.filename));
  }

  // Delete from R2
  const uniqueFiles = [...new Set(filesToDelete)];
  if (uniqueFiles.length > 0) await r2.deleteFiles(uniqueFiles);

  // Cascade: tracks with this project_id will have project_id set to NULL (ON DELETE SET NULL)
  // But we want to delete the tracks entirely for this project
  if (trackIds.length > 0) {
    const placeholders = trackIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...trackIds);
  }
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, req.userId);

  res.json({ ok: true });
});

module.exports = router;
