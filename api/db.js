const { Pool } = require('pg');

let isPg = true;
let pgPool = null;

function getPool() {
  if (!pgPool && process.env.DATABASE_URL) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pgPool;
}

function convertSqlToPg(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const db = {
  get: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (!pool) return callback(null, null);

    const pgSql = convertSqlToPg(sql);
    pool.query(pgSql, params)
      .then(res => callback(null, res.rows[0]))
      .catch(err => callback(err, null));
  },

  all: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (!pool) return callback(null, []);

    const pgSql = convertSqlToPg(sql);
    pool.query(pgSql, params)
      .then(res => callback(null, res.rows))
      .catch(err => callback(err, null));
  },

  run: function(sql, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pool = getPool();
    if (!pool) {
      if (callback) callback(null);
      return;
    }

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
