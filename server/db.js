const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
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
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
  sqliteDb = new sqlite3.Database(dbPath);
}

// Convert SQLite '?' parameters to PostgreSQL '$1', '$2', '$3'
function convertSqlToPg(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

async function initTables() {
  if (isPg) {
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
      console.log('[SUPABASE DB] All PostgreSQL tables & indexes verified successfully.');
    } catch (err) {
      console.error('[SUPABASE DB ERROR] Failed to initialize PostgreSQL tables:', err);
    } finally {
      client.release();
    }
  } else {
    sqliteDb.serialize(() => {
      sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        passwordHash TEXT,
        publicKey TEXT,
        avatar TEXT,
        lastSeen TEXT,
        banStatus TEXT DEFAULT 'active',
        banExpiresAt TEXT
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS global_messages (
        messageId TEXT PRIMARY KEY,
        sender TEXT,
        message TEXT,
        type TEXT,
        mimeType TEXT,
        fileName TEXT,
        fileBuffer TEXT,
        replyTo TEXT,
        timestamp TEXT,
        reactions TEXT DEFAULT '{}'
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        messageId TEXT UNIQUE,
        fromUser TEXT,
        toUser TEXT,
        encryptedMessage TEXT,
        timestamp TEXT,
        delivered INTEGER DEFAULT 0,
        status TEXT DEFAULT 'sent',
        deliveredAt TEXT,
        readAt TEXT
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS global_message_reads (
        messageId TEXT,
        username TEXT,
        PRIMARY KEY (messageId, username)
      )`);

      sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_pm_to_status ON private_messages(toUser, status)`);
      sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_pm_conversation ON private_messages(fromUser, toUser, timestamp)`);
      sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_gm_timestamp ON global_messages(timestamp)`);
      sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_gmr_user ON global_message_reads(username, messageId)`);
      console.log('[SQLITE DB] SQLite database verified successfully.');
    });
  }
}

// Unified db interface compatible with sqlite3 callbacks
const db = {
  get: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (isPg) {
      const pgSql = convertSqlToPg(sql);
      pgPool.query(pgSql, params)
        .then(res => callback(null, res.rows[0]))
        .catch(err => callback(err, null));
    } else {
      sqliteDb.get(sql, params, callback);
    }
  },

  all: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (isPg) {
      const pgSql = convertSqlToPg(sql);
      pgPool.query(pgSql, params)
        .then(res => callback(null, res.rows))
        .catch(err => callback(err, null));
    } else {
      sqliteDb.all(sql, params, callback);
    }
  },

  run: function(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (isPg) {
      let pgSql = convertSqlToPg(sql);
      // Handle SQLite INSERT OR IGNORE -> PostgreSQL ON CONFLICT DO NOTHING
      if (pgSql.includes('INSERT OR IGNORE INTO')) {
        pgSql = pgSql.replace('INSERT OR IGNORE INTO', 'INSERT INTO');
        if (!pgSql.includes('ON CONFLICT')) {
          pgSql += ' ON CONFLICT DO NOTHING';
        }
      }
      pgPool.query(pgSql, params)
        .then(res => {
          const context = { lastID: res.rowCount, changes: res.rowCount };
          if (callback) callback.call(context, null);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    } else {
      sqliteDb.run(sql, params, function(err) {
        if (callback) callback.call(this, err);
      });
    }
  },

  prepare: (sql) => {
    if (isPg) {
      const pgSql = convertSqlToPg(sql).replace('INSERT OR IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
      return {
        run: (p1, p2) => {
          pgPool.query(pgSql, [p1, p2]).catch(e => {});
        },
        finalize: (cb) => {
          if (cb) cb();
        }
      };
    } else {
      return sqliteDb.prepare(sql);
    }
  }
};

initTables();

module.exports = db;
