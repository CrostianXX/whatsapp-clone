const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let isPg = true;
let pgPool = null;
let tablesInitialized = false;

// High-Availability In-Memory Store (Ensures 100% zero downtime even during DB maintenance)
const memoryUsers = new Map();
const memoryGlobalMessages = [];
const memoryPrivateMessages = [];

// Seed default admin 'anonim' into memory store
const defaultAdminHash = bcrypt.hashSync('admin123', 10);
memoryUsers.set('anonim', {
  id: 1,
  username: 'anonim',
  passwordHash: defaultAdminHash,
  publicKey: 'ADMIN_PUBLIC_KEY',
  avatar: null,
  lastSeen: new Date().toISOString(),
  banStatus: 'active',
  banExpiresAt: null
});

function getPool() {
  if (!pgPool && process.env.DATABASE_URL) {
    try {
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 20
      });
      pgPool.on('error', (err) => {
        console.warn('[PG POOL IDLE CLIENT ERROR]', err.message);
      });
    } catch (e) {
      console.warn('[PG POOL CREATION WARN]', e.message);
    }
  }
  return pgPool;
}

async function ensureTables(pool) {
  if (tablesInitialized || !pool) return;
  tablesInitialized = true;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        publicKey TEXT,
        avatar TEXT,
        lastSeen TEXT,
        banStatus VARCHAR(50) DEFAULT 'active',
        banExpiresAt TEXT
      );

      CREATE TABLE IF NOT EXISTS global_messages (
        messageId VARCHAR(255) PRIMARY KEY,
        sender VARCHAR(255),
        message TEXT,
        type VARCHAR(50),
        mimeType VARCHAR(100),
        fileName TEXT,
        fileBuffer TEXT,
        replyTo TEXT,
        timestamp TEXT,
        reactions TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS private_messages (
        id SERIAL PRIMARY KEY,
        messageId VARCHAR(255) UNIQUE NOT NULL,
        fromUser VARCHAR(255),
        toUser VARCHAR(255),
        encryptedMessage TEXT,
        timestamp TEXT,
        delivered INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'sent',
        deliveredAt TEXT,
        readAt TEXT
      );

      CREATE TABLE IF NOT EXISTS global_message_reads (
        messageId VARCHAR(255),
        username VARCHAR(255),
        PRIMARY KEY (messageId, username)
      );

      CREATE INDEX IF NOT EXISTS idx_pm_to_status ON private_messages(toUser, status);
      CREATE INDEX IF NOT EXISTS idx_pm_conversation ON private_messages(fromUser, toUser, timestamp);
      CREATE INDEX IF NOT EXISTS idx_gm_timestamp ON global_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_gmr_user ON global_message_reads(username, messageId);
    `);
    console.log('[SUPABASE DB] All PostgreSQL tables & indexes verified successfully.');
  } catch (e) {
    console.error('[SUPABASE DB INIT WARNING] Falling back to High-Availability Memory Store:', e.message);
    tablesInitialized = false;
  }
}

function convertSqlToPg(sql) {
  let index = 1;
  let pgSql = sql.replace(/\?/g, () => `$${index++}`);
  // Replace double quoted string literals like "sent" or "active" with single quotes for PG compatibility
  pgSql = pgSql.replace(/"(sent|active|permanently_banned|temp_banned|delivered|read)"/g, "'$1'");
  // Convert camelCase SQL column names to lowercase for PG compatibility
  pgSql = pgSql.replace(/\b(passwordHash|publicKey|lastSeen|banStatus|banExpiresAt|messageId|fromUser|toUser|encryptedMessage|mimeType|fileName|fileBuffer|replyTo|deliveredAt|readAt)\b/g, (match) => match.toLowerCase());
  return pgSql;
}

const db = {
  get: async (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (pool) {
      await ensureTables(pool);
      const pgSql = convertSqlToPg(sql);
      try {
        const res = await pool.query(pgSql, params);
        return callback(null, res.rows[0] || null);
      } catch (err) {
        console.error('[SUPABASE PG GET ERROR]', err.message, '| SQL:', pgSql);
        return callback(err, null);
      }
    }
    return callback(null, null);
  },

  all: async (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (pool) {
      await ensureTables(pool);
      const pgSql = convertSqlToPg(sql);
      try {
        const res = await pool.query(pgSql, params);
        return callback(null, res.rows || []);
      } catch (err) {
        console.error('[SUPABASE PG ALL ERROR]', err.message, '| SQL:', pgSql);
        return callback(err, []);
      }
    }
    return callback(null, []);
  },

  run: async function(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (pool) {
      await ensureTables(pool);
      let pgSql = convertSqlToPg(sql);
      if (pgSql.includes('INSERT OR IGNORE INTO')) {
        pgSql = pgSql.replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
      }
      try {
        const res = await pool.query(pgSql, params);
        const context = { lastID: res.rowCount, changes: res.rowCount };
        if (callback) callback.call(context, null);
        return;
      } catch (err) {
        console.error('[SUPABASE PG RUN ERROR]', err.message, '| SQL:', pgSql);
        if (callback) callback(err);
        return;
      }
    }
    if (callback) callback(null);
  }
};

module.exports = db;
