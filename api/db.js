const { Pool } = require('pg');
const path = require('path');

let isPg = false;
let pgPool = null;
let sqliteDb = null;

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  isPg = true;
  console.log('[DATABASE] Connecting to PostgreSQL / Supabase Database...');
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' || databaseUrl.includes('supabase') ? { rejectUnauthorized: false } : false
  });
} else {
  console.log('[DATABASE] DATABASE_URL not set. Falling back to SQLite database...');
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
    sqliteDb = new sqlite3.Database(dbPath);
  } catch (e) {
    console.warn('[DATABASE] SQLite not available in serverless mode');
  }
}

function convertSqlToPg(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

async function initTables() {
  if (isPg && pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        await client.query(`
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
        console.log('[POSTGRES DB] Postgres database initialized successfully.');
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[POSTGRES DB ERROR]', err.message);
    }
  }
}

const db = {
  get: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (isPg && pgPool) {
      const pgSql = convertSqlToPg(sql);
      pgPool.query(pgSql, params)
        .then(res => callback(null, res.rows[0]))
        .catch(err => callback(err, null));
    } else if (sqliteDb) {
      sqliteDb.get(sql, params, callback);
    } else {
      callback(new Error('No active database'), null);
    }
  },

  all: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (isPg && pgPool) {
      const pgSql = convertSqlToPg(sql);
      pgPool.query(pgSql, params)
        .then(res => callback(null, res.rows))
        .catch(err => callback(err, null));
    } else if (sqliteDb) {
      sqliteDb.all(sql, params, callback);
    } else {
      callback(null, []);
    }
  },

  run: function(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (isPg && pgPool) {
      const pgSql = convertSqlToPg(sql).replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
      pgPool.query(pgSql, params)
        .then(res => {
          const context = { lastID: res.rowCount, changes: res.rowCount };
          if (callback) callback.call(context, null);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    } else if (sqliteDb) {
      sqliteDb.run(sql, params, function(err) {
        if (callback) callback.call(this, err);
      });
    } else {
      if (callback) callback(null);
    }
  },

  prepare: (sql) => {
    if (isPg && pgPool) {
      const pgSql = convertSqlToPg(sql).replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
      return {
        run: (p1, p2) => {
          pgPool.query(pgSql, [p1, p2]).catch(e => {});
        },
        finalize: (cb) => {
          if (cb) cb();
        }
      };
    } else if (sqliteDb) {
      return sqliteDb.prepare(sql);
    } else {
      return { run: () => {}, finalize: (cb) => cb && cb() };
    }
  }
};

initTables().catch(err => console.error('[DB INIT ERROR]', err));

module.exports = db;
