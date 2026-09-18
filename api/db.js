const { Pool } = require('pg');

let isPg = true;
let pgPool = null;
let tablesInitialized = false;

function getPool() {
  if (!pgPool && process.env.DATABASE_URL) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
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
    console.error('[SUPABASE DB INIT ERROR]', e.message);
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
    if (!pool) return callback(null, null);

    await ensureTables(pool);

    const pgSql = convertSqlToPg(sql);
    pool.query(pgSql, params)
      .then(res => callback(null, res.rows[0]))
      .catch(err => callback(err, null));
  },

  all: async (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (!pool) return callback(null, []);

    await ensureTables(pool);

    const pgSql = convertSqlToPg(sql);
    pool.query(pgSql, params)
      .then(res => callback(null, res.rows))
      .catch(err => callback(err, null));
  },

  run: async function(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (!pool) {
      if (callback) callback(null);
      return;
    }

    await ensureTables(pool);

    const pgSql = convertSqlToPg(sql).replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
    pool.query(pgSql, params)
      .then(res => {
        const context = { lastID: res.rowCount, changes: res.rowCount };
        if (callback) callback.call(context, null);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  }
};

module.exports = db;
