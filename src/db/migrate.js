/**
 * Migration script: Import data from untitled-local JSON DB + local files to Revis Cloud (SQLite + R2)
 *
 * Usage:
 *   node src/db/migrate.js /path/to/untitled-local
 *
 * This will:
 * 1. Read data/db.json from the local version
 * 2. Upload all audio files from uploads/ to R2
 * 3. Insert all records into SQLite with a default user ID
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('./index');
const r2 = require('../storage/r2');
const { genId } = require('../utils/helpers');

const LOCAL_DIR = process.argv[2];
if (!LOCAL_DIR) {
  console.error('Usage: node src/db/migrate.js /path/to/untitled-local');
  process.exit(1);
}

const DB_FILE = path.join(LOCAL_DIR, 'data', 'db.json');
const UPLOADS_DIR = path.join(LOCAL_DIR, 'uploads');

if (!fs.existsSync(DB_FILE)) {
  console.error('db.json not found at', DB_FILE);
  process.exit(1);
}

async function migrate() {
  console.log('\n  ✦ Revis Migration: Local → Cloud\n');

  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));

  // Create a default migration user
  const userId = 'migrated_user_' + genId();
  console.log('  Creating migration user:', userId);
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at)
    VALUES (?, 'migrated@revis.local', 'Migrated User', datetime('now'), datetime('now'))
  `).run(userId);

  // Migrate projects
  console.log(`  Migrating ${data.projects?.length || 0} projects...`);
  for (const p of (data.projects || [])) {
    db.prepare('INSERT INTO projects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(p.id, userId, p.name, p.color, p.createdAt);
  }

  // Migrate tracks + upload files to R2
  console.log(`  Migrating ${data.tracks?.length || 0} tracks...`);
  let filesUploaded = 0;
  const fileKeyMap = {}; // old filename -> new R2 key

  for (const t of (data.tracks || [])) {
    const localFile = path.join(UPLOADS_DIR, t.filename);
    let r2Key = t.filename;

    if (fs.existsSync(localFile)) {
      r2Key = `${userId}/${t.filename}`;
      const ext = path.extname(t.filename).toLowerCase();
      const mimeTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4' };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      console.log(`    Uploading ${t.filename} → R2: ${r2Key}`);
      await r2.uploadFile(r2Key, fs.readFileSync(localFile), contentType);
      filesUploaded++;
    } else {
      console.warn(`    ⚠ File not found: ${localFile}`);
    }

    fileKeyMap[t.filename] = r2Key;

    db.prepare(`
      INSERT INTO tracks (id, user_id, project_id, name, filename, original_name, duration, size, bpm, key, "order", created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(t.id, userId, t.projectId, t.name, r2Key, t.originalName, t.duration, t.size, t.bpm, t.key, t.order || 0, t.createdAt, t.updatedAt);
  }

  // Migrate versions + upload files
  console.log(`  Migrating ${data.versions?.length || 0} versions...`);
  for (const v of (data.versions || [])) {
    let r2Key = fileKeyMap[v.filename];
    if (!r2Key) {
      const localFile = path.join(UPLOADS_DIR, v.filename);
      if (fs.existsSync(localFile)) {
        r2Key = `${userId}/${v.filename}`;
        const ext = path.extname(v.filename).toLowerCase();
        const mimeTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };
        console.log(`    Uploading version ${v.filename} → R2: ${r2Key}`);
        await r2.uploadFile(r2Key, fs.readFileSync(localFile), mimeTypes[ext] || 'application/octet-stream');
        fileKeyMap[v.filename] = r2Key;
        filesUploaded++;
      } else {
        r2Key = v.filename;
        console.warn(`    ⚠ Version file not found: ${localFile}`);
      }
    }

    db.prepare(`
      INSERT INTO versions (id, track_id, user_id, version_number, filename, original_name, size, duration, comment, uploaded_by, is_current, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(v.id, v.trackId, userId, v.versionNumber, r2Key, v.originalName, v.size, v.duration, v.comment, v.uploadedBy, v.isCurrent ? 1 : 0, v.createdAt);
  }

  // Migrate stems + upload files
  console.log(`  Migrating ${data.stems?.length || 0} stems...`);
  for (const s of (data.stems || [])) {
    let r2Key = fileKeyMap[s.filename];
    if (!r2Key) {
      const localFile = path.join(UPLOADS_DIR, s.filename);
      if (fs.existsSync(localFile)) {
        r2Key = `${userId}/stems/${s.filename}`;
        const ext = path.extname(s.filename).toLowerCase();
        const mimeTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
        console.log(`    Uploading stem ${s.filename} → R2: ${r2Key}`);
        await r2.uploadFile(r2Key, fs.readFileSync(localFile), mimeTypes[ext] || 'application/octet-stream');
        fileKeyMap[s.filename] = r2Key;
        filesUploaded++;
      } else {
        r2Key = s.filename;
        console.warn(`    ⚠ Stem file not found: ${localFile}`);
      }
    }

    db.prepare(`
      INSERT INTO stems (id, track_id, user_id, name, type, filename, original_name, size, duration, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(s.id, s.trackId, userId, s.name, s.type, r2Key, s.originalName, s.size, s.duration, s.uploadedBy, s.createdAt);
  }

  // Migrate share links
  console.log(`  Migrating ${data.shareLinks?.length || 0} share links...`);
  for (const l of (data.shareLinks || [])) {
    db.prepare(`
      INSERT INTO share_links (id, track_id, user_id, slug, password_hash, listens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(l.id, l.trackId, userId, l.slug, l.passwordHash, l.listens, l.createdAt);
  }

  // Summary
  console.log('\n  ✦ Migration complete!');
  console.log(`    Projects: ${data.projects?.length || 0}`);
  console.log(`    Tracks: ${data.tracks?.length || 0}`);
  console.log(`    Versions: ${data.versions?.length || 0}`);
  console.log(`    Stems: ${data.stems?.length || 0}`);
  console.log(`    Share links: ${data.shareLinks?.length || 0}`);
  console.log(`    Files uploaded to R2: ${filesUploaded}`);
  console.log(`    User ID: ${userId}`);
  console.log('\n  ⚠ Note: The migration user ID is temporary.');
  console.log('    After signing in with Clerk, you can reassign data to your real user ID.\n');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
