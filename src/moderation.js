import { initDatabase } from './database.js';

// Common explicit/abusive words filter (English & Hindi)
const BAD_WORDS = [
  'gaali', 'chutiya', 'bhenchod', 'madarchod', 'bhosdike', 'harami', 'kutta',
  'kamina', 'randi', 'lund', 'gand', 'gaand', 'mc', 'bc', 'bsdk', 'saale',
  'fuck', 'bitch', 'asshole', 'bastard', 'motherfucker', 'dick', 'pussy',
  'cunt', 'shit', 'retard', 'porn', 'nude', 'xxx'
];

/**
 * Checks if a text message contains explicit / abusive words
 * @param {string} text 
 * @returns {string|null} The matched bad word, or null
 */
export function checkExplicitContent(text) {
  if (!text) return null;
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/);

  for (const word of words) {
    if (BAD_WORDS.includes(word)) {
      return word;
    }
  }

  // Also check direct inclusion for compound slurs
  for (const bad of BAD_WORDS) {
    if (bad.length >= 4 && clean.includes(bad)) {
      return bad;
    }
  }

  return null;
}

/**
 * Records a warning for a user in a group and returns current warning count
 */
export function recordWarning(db, groupJid, userJid, reason = 'Explicit / Abusive Language') {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_warnings (
      group_jid TEXT,
      user_jid TEXT,
      count INTEGER DEFAULT 0,
      last_reason TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_jid, user_jid)
    );
  `);

  const stmt = db.prepare(`
    INSERT INTO user_warnings (group_jid, user_jid, count, last_reason, updated_at)
    VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(group_jid, user_jid) DO UPDATE SET
      count = user_warnings.count + 1,
      last_reason = excluded.last_reason,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(groupJid, userJid, reason);

  const getStmt = db.prepare(`SELECT count FROM user_warnings WHERE group_jid = ? AND user_jid = ?`);
  const row = getStmt.get(groupJid, userJid);
  return row ? row.count : 1;
}

/**
 * Resets warnings for a user
 */
export function resetWarning(db, groupJid, userJid) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_warnings (
      group_jid TEXT,
      user_jid TEXT,
      count INTEGER DEFAULT 0,
      last_reason TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_jid, user_jid)
    );
  `);
  const stmt = db.prepare(`DELETE FROM user_warnings WHERE group_jid = ? AND user_jid = ?`);
  return stmt.run(groupJid, userJid);
}

/**
 * Gets current warnings for a user
 */
export function getWarningCount(db, groupJid, userJid) {
  try {
    const stmt = db.prepare(`SELECT count FROM user_warnings WHERE group_jid = ? AND user_jid = ?`);
    const row = stmt.get(groupJid, userJid);
    return row ? row.count : 0;
  } catch (e) {
    return 0;
  }
}
