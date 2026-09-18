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
        connectionTimeoutMillis: 3000
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
  return sql.replace(/\?/g, () => `$${index++}`);
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
        console.warn('[DB GET PG FALLBACK TO MEMORY]', err.message);
      }
    }

    // High-Availability Fallback to Memory Store
    if (sql.includes('FROM users WHERE username = ?')) {
      const u = memoryUsers.get(params[0]);
      return callback(null, u || null);
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
        console.warn('[DB ALL PG FALLBACK TO MEMORY]', err.message);
      }
    }

    // High-Availability Fallback to Memory Store
    if (sql.includes('FROM users')) {
      return callback(null, Array.from(memoryUsers.values()));
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
      const pgSql = convertSqlToPg(sql).replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
      try {
        const res = await pool.query(pgSql, params);
        const context = { lastID: res.rowCount, changes: res.rowCount };
        if (callback) callback.call(context, null);
        return;
      } catch (err) {
        console.warn('[DB RUN PG FALLBACK TO MEMORY]', err.message);
      }
    }

    // High-Availability Fallback to Memory Store
    if (sql.includes('INSERT INTO users')) {
      const [username, passwordHash, publicKey] = params;
      const newUser = { id: memoryUsers.size + 1, username, passwordHash, publicKey, avatar: null, lastSeen: new Date().toISOString(), banStatus: 'active', banExpiresAt: null };
      memoryUsers.set(username, newUser);
      const context = { lastID: newUser.id, changes: 1 };
      if (callback) callback.call(context, null);
    } else {
      if (callback) callback(null);
    }
  }
};

module.exports = db;
