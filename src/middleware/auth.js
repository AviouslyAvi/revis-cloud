const { requireAuth, getAuth, clerkClient } = require('@clerk/express');
const db = require('../db');

/**
 * Middleware: Ensure the authenticated Clerk user exists in our local DB.
 * Creates/updates the user record as needed.
 * Attaches req.userId (string) for use in route handlers.
 */
async function ensureUser(req, res, next) {
  try {
    const auth = getAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clerkUserId = auth.userId;

    // Check if user exists in our DB
    let user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(clerkUserId);

    if (!user) {
      // Fetch from Clerk and create locally
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || 'User';
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
        const avatar = clerkUser.imageUrl || '';

        db.prepare(`
          INSERT INTO users (id, email, name, avatar_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(clerkUserId, email, name, avatar);

        user = { id: clerkUserId, name, email };
      } catch (err) {
        console.error('Failed to fetch Clerk user:', err.message);
        // Create a minimal record
        db.prepare(`
          INSERT OR IGNORE INTO users (id, name, created_at, updated_at)
          VALUES (?, 'User', datetime('now'), datetime('now'))
        `).run(clerkUserId);
        user = { id: clerkUserId, name: 'User' };
      }
    }

    req.userId = clerkUserId;
    req.userName = user.name;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Auth error' });
  }
}

module.exports = { requireAuth, ensureUser };
