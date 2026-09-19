const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pgPool = null;
let tablesInitialized = false;

// High-Availability In-Memory Store
const memoryUsers = new Map();
const memoryGlobalMessages = [];
const memoryPrivateMessages = [];

// Seed default user 'anonim' into memory store with initial password 123n
const defaultUserHash = bcrypt.hashSync('123n', 10);
memoryUsers.set('anonim', {
  id: 1,
  username: 'anonim',
  passwordHash: defaultUserHash,
  publicKey: null,
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
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 5000,
        max: 3,
        allowExitOnIdle: true
      });
      pgPool.on('error', (err) => {
        console.warn('[PG POOL IDLE WARN]', err.message);
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
    console.error('[SUPABASE DB INIT WARNING] Falling back to High-Availability Store:', e.message);
    tablesInitialized = false;
  }
}

function convertSqlToPg(sql) {
  let index = 1;
  let pgSql = sql.replace(/\?/g, () => `$${index++}`);
  pgSql = pgSql.replace(/"(sent|active|permanently_banned|temp_banned|delivered|read)"/g, "'$1'");
  pgSql = pgSql.replace(/\b(passwordHash|publicKey|lastSeen|banStatus|banExpiresAt|messageId|fromUser|toUser|encryptedMessage|mimeType|fileName|fileBuffer|replyTo|deliveredAt|readAt)\b/g, (match) => match.toLowerCase());
  return pgSql;
}

// Fallback memory handlers
function fallbackGet(sql, params) {
  const cleanSql = sql.toLowerCase();
  if (cleanSql.includes('from users where username =')) {
    const targetUser = (params[0] || '').toString();
    const found = memoryUsers.get(targetUser);
    return found || null;
  }
  if (cleanSql.includes('count(*) as count from users')) {
    return { count: memoryUsers.size };
  }
  if (cleanSql.includes('from global_messages')) {
    const found = memoryGlobalMessages[memoryGlobalMessages.length - 1];
    return found || null;
  }
  return null;
}

function fallbackAll(sql, params) {
  const cleanSql = sql.toLowerCase();
  if (cleanSql.includes('from users')) {
    return Array.from(memoryUsers.values()).filter(u => u.username && !u.username.startsWith('2026-') && !u.username.includes('T'));
  }
  if (cleanSql.includes('count(*) as count from private_messages')) {
    const user = params[0];
    const counts = {};
    memoryPrivateMessages.forEach(pm => {
      if (pm.toUser === user && pm.status !== 'read') {
        counts[pm.fromUser] = (counts[pm.fromUser] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([fromUser, count]) => ({ fromUser, fromuser: fromUser, count }));
  }
  if (cleanSql.includes('from private_messages')) {
    const user = params[0];
    const peer = params[2];
    return memoryPrivateMessages.filter(pm => {
      if (peer) {
        return (pm.fromUser === user && pm.toUser === peer) || (pm.fromUser === peer && pm.toUser === user);
      }
      return pm.fromUser === user || pm.toUser === user;
    });
  }
  if (cleanSql.includes('from global_messages')) {
    return memoryGlobalMessages;
  }
  return [];
}

function fallbackRun(sql, params) {
  const cleanSql = sql.toLowerCase();
  if (cleanSql.includes('update users set lastseen')) {
    const lastSeen = params[0];
    const username = params[1];
    if (username && memoryUsers.has(username)) {
      const existing = memoryUsers.get(username);
      memoryUsers.set(username, { ...existing, lastSeen });
    }
  } else if (cleanSql.includes('insert into users') || cleanSql.includes('update users')) {
    let username = params[0] ? params[0].toString() : '';
    if (cleanSql.includes('where username =')) {
      username = (params[params.length - 1] || '').toString();
    }
    if (username && !username.startsWith('2026-') && !username.includes('T')) {
      const existing = memoryUsers.get(username) || {};
      let passwordHash = existing.passwordHash || defaultUserHash;
      let publicKey = existing.publicKey || null;
      let avatar = existing.avatar || null;
      let lastSeen = existing.lastSeen || new Date().toISOString();

      // Parse parameters dynamically
      for (const p of params) {
        if (typeof p === 'string') {
          if (p.startsWith('data:image') || p.startsWith('http://') || p.startsWith('https://')) {
            avatar = p;
          } else if (p.includes('"n":') && p.includes('"e":')) {
            publicKey = p;
          }
        }
      }

      memoryUsers.set(username, {
        id: existing.id || (memoryUsers.size + 1),
        username: username,
        passwordHash: passwordHash,
        publicKey: publicKey,
        avatar: avatar,
        lastSeen: new Date().toISOString(),
        banStatus: existing.banStatus || 'active',
        banExpiresAt: existing.banExpiresAt || null
      });
    }
  } else if (cleanSql.includes('insert into private_messages')) {
    const msgId = params[0];
    const fromUser = params[1];
    const toUser = params[2];
    const encryptedMessage = params[3];
    const timestamp = params[4];
    memoryPrivateMessages.push({
      id: memoryPrivateMessages.length + 1,
      messageId: msgId,
      fromUser,
      toUser,
      encryptedMessage,
      timestamp,
      delivered: 1,
      status: 'sent'
    });
  } else if (cleanSql.includes('insert into global_messages')) {
    const msgId = params[0];
    const sender = params[1];
    const message = params[2];
    const type = params[3];
    const mimeType = params[4];
    const fileName = params[5];
    const fileBuffer = params[6];
    const replyTo = params[7];
    const timestamp = params[8];
    memoryGlobalMessages.push({
      messageId: msgId,
      sender,
      message,
      type,
      mimeType,
      fileName,
      fileBuffer,
      replyTo,
      timestamp,
      reactions: '{}'
    });
  } else if (cleanSql.includes('update private_messages')) {
    const now = new Date().toISOString();
    if (cleanSql.includes("status = 'read'")) {
      const toUser = params[1];
      const fromUser = params[2];
      memoryPrivateMessages.forEach(pm => {
        if ((pm.toUser === toUser && pm.fromUser === fromUser) || (toUser && !fromUser && pm.toUser === toUser)) {
          pm.status = 'read';
          pm.readAt = now;
        }
      });
    } else if (cleanSql.includes("status = 'delivered'")) {
      const toUser = params[0];
      memoryPrivateMessages.forEach(pm => {
        if (pm.toUser === toUser && pm.status === 'sent') {
          pm.status = 'delivered';
          pm.deliveredAt = now;
        }
      });
    }
  }
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
        const row = res.rows[0] || null;
        return callback(null, row);
      } catch (err) {
        console.warn('[PG GET FALLBACK WARN]', err.message);
        const fb = fallbackGet(sql, params);
        return callback(null, fb);
      }
    }
    const fb = fallbackGet(sql, params);
    return callback(null, fb);
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
        const rows = res.rows || [];

        // Keep memoryUsers updated whenever users table is queried
        if (sql.toLowerCase().includes('from users') && rows.length > 0) {
          rows.forEach(r => {
            const uname = r.username;
            if (uname) {
              memoryUsers.set(uname, {
                id: r.id,
                username: r.username,
                passwordHash: r.passwordhash || r.passwordHash,
                publicKey: r.publickey || r.publicKey,
                avatar: r.avatar,
                lastSeen: r.lastseen || r.lastSeen,
                banStatus: r.banstatus || r.banStatus || 'active',
                banExpiresAt: r.banexpiresat || r.banExpiresAt
              });
            }
          });
        }

        return callback(null, rows);
      } catch (err) {
        console.warn('[PG ALL FALLBACK WARN]', err.message);
        const fb = fallbackAll(sql, params);
        return callback(null, fb);
      }
    }
    const fb = fallbackAll(sql, params);
    return callback(null, fb);
  },

  run: async function(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    fallbackRun(sql, params);
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
        console.warn('[PG RUN FALLBACK WARN]', err.message);
        const context = { lastID: 1, changes: 1 };
        if (callback) callback.call(context, null);
        return;
      }
    }
    if (callback) callback(null);
  },
  getPool: getPool
};

module.exports = db;
