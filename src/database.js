import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

let db = null;

export function getDb() {
  if (!db) initDatabase();
  return db;
}

export function initDatabase() {
  const dbDir = path.dirname(CONFIG.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new DatabaseSync(CONFIG.DB_PATH);

  // Users global stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      jid TEXT PRIMARY KEY,
      name TEXT,
      score INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      total_answered INTEGER DEFAULT 0,
      fastest_count INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Group specific scores
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_scores (
      group_jid TEXT,
      user_jid TEXT,
      name TEXT,
      score INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      total_answered INTEGER DEFAULT 0,
      fastest_count INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_jid, user_jid)
    );
  `);

  // History table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT,
      user_jid TEXT,
      question_id INTEGER,
      is_correct INTEGER,
      is_fastest INTEGER,
      points INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Bot settings key-value store
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ SQLite Database initialized successfully at:', CONFIG.DB_PATH);
  return db;
}

export function recordAnswer({ groupJid, userJid, userName, questionId = 0, isCorrect, isFastest, points }) {
  if (!db) initDatabase();

  const correctInc = isCorrect ? 1 : 0;
  const fastestInc = isFastest ? 1 : 0;

  // 1. Update Global user stats
  const upsertUser = db.prepare(`
    INSERT INTO users (jid, name, score, correct_answers, total_answered, fastest_count, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(jid) DO UPDATE SET
      name = COALESCE(excluded.name, users.name),
      score = users.score + excluded.score,
      correct_answers = users.correct_answers + excluded.correct_answers,
      total_answered = users.total_answered + 1,
      fastest_count = users.fastest_count + excluded.fastest_count,
      updated_at = CURRENT_TIMESTAMP
  `);
  upsertUser.run(userJid, userName, points, correctInc, fastestInc);

  // 2. Update Group-specific user stats
  if (groupJid && groupJid.endsWith('@g.us')) {
    const upsertGroupScore = db.prepare(`
      INSERT INTO group_scores (group_jid, user_jid, name, score, correct_answers, total_answered, fastest_count, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(group_jid, user_jid) DO UPDATE SET
        name = COALESCE(excluded.name, group_scores.name),
        score = group_scores.score + excluded.score,
        correct_answers = group_scores.correct_answers + excluded.correct_answers,
        total_answered = group_scores.total_answered + 1,
        fastest_count = group_scores.fastest_count + excluded.fastest_count,
        updated_at = CURRENT_TIMESTAMP
    `);
    upsertGroupScore.run(groupJid, userJid, userName, points, correctInc, fastestInc);
  }

  // 3. Record history
  const insertHistory = db.prepare(`
    INSERT INTO quiz_history (group_jid, user_jid, question_id, is_correct, is_fastest, points)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertHistory.run(groupJid, userJid, questionId, correctInc, fastestInc, points);
}

export function getGroupLeaderboard(groupJid, limit = 10) {
  if (!db) initDatabase();
  const stmt = db.prepare(`
    SELECT user_jid, name, score, correct_answers, total_answered, fastest_count
    FROM group_scores
    WHERE group_jid = ?
    ORDER BY score DESC, correct_answers DESC, fastest_count DESC
    LIMIT ?
  `);
  return stmt.all(groupJid, limit);
}

export function getGlobalLeaderboard(limit = 10) {
  if (!db) initDatabase();
  const stmt = db.prepare(`
    SELECT jid AS user_jid, name, score, correct_answers, total_answered, fastest_count
    FROM users
    ORDER BY score DESC, correct_answers DESC, fastest_count DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function getUserStats(groupJid, userJid) {
  if (!db) initDatabase();

  let userStats;
  let totalParticipants = 0;
  let rank = 0;

  if (groupJid && groupJid.endsWith('@g.us')) {
    const all = db.prepare(`
      SELECT user_jid, score, correct_answers, total_answered, fastest_count
      FROM group_scores
      WHERE group_jid = ?
      ORDER BY score DESC, correct_answers DESC
    `).all(groupJid);

    totalParticipants = all.length;
    const index = all.findIndex(u => u.user_jid === userJid);
    if (index !== -1) {
      rank = index + 1;
      userStats = all[index];
    }
  } else {
    const all = db.prepare(`
      SELECT jid AS user_jid, score, correct_answers, total_answered, fastest_count
      FROM users
      ORDER BY score DESC, correct_answers DESC
    `).all();

    totalParticipants = all.length;
    const index = all.findIndex(u => u.user_jid === userJid);
    if (index !== -1) {
      rank = index + 1;
      userStats = all[index];
    }
  }

  return {
    found: Boolean(userStats),
    rank,
    totalParticipants,
    stats: userStats || { score: 0, correct_answers: 0, total_answered: 0, fastest_count: 0 }
  };
}

export function resetGroupLeaderboard(groupJid) {
  if (!db) initDatabase();
  const stmt = db.prepare(`DELETE FROM group_scores WHERE group_jid = ?`);
  return stmt.run(groupJid);
}

export function getBotSetting(key) {
  if (!db) initDatabase();
  const row = db.prepare(`SELECT value FROM bot_settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

export function setBotSetting(key, value) {
  if (!db) initDatabase();
  const stmt = db.prepare(`
    INSERT INTO bot_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(key, value);
}

export function getPlayerTier(score) {
  if (score >= 300) return { title: 'Grandmaster', badge: '👑' };
  if (score >= 150) return { title: 'Trivia Master', badge: '🥇' };
  if (score >= 50) return { title: 'Knowledge Seeker', badge: '🥈' };
  return { title: 'Rookie Quizzer', badge: '🥉' };
}
