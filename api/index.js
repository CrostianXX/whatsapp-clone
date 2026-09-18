const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const helmet = require('helmet');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      mediaSrc: ["'self'", "blob:", "data:"],
      workerSrc: ["'self'", "blob:"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-whatsapp-key-123';
const db = require('./db');
const { uploadMedia } = require('./cloudinary');
const ADMIN_PIN = process.env.ADMIN_PIN || '123458';

const registrationIpMap = new Map();
const REGISTRATION_LIMIT = 3;
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;

const activeSessions = new Map();

app.post('/register', async (req, res) => {
  const { username, password, publicKey } = req.body;
  if (!username || !password || !publicKey) {
    return res.status(400).json({ error: 'Semua kolom wajib diisi' });
  }

  const cleanUser = username.trim();

  if (cleanUser.length < 3 || cleanUser.length > 20) {
    return res.status(400).json({ error: 'Username harus 3 - 20 karakter.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUser)) {
    return res.status(400).json({ error: 'Username hanya boleh berisi huruf, angka, dan underscore (_).' });
  }
  const reservedNames = ['anonim', 'global', 'admin', 'system', 'root'];
  if (reservedNames.includes(cleanUser.toLowerCase())) {
    return res.status(400).json({ error: 'Username ini dilindungi sistem dan tidak dapat didaftarkan.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal harus 6 karakter.' });
  }

  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const ipRecord = registrationIpMap.get(clientIp) || { count: 0, windowStart: now };
  
  if (now - ipRecord.windowStart > REGISTRATION_WINDOW_MS) {
    ipRecord.count = 0;
    ipRecord.windowStart = now;
  }

  if (ipRecord.count >= REGISTRATION_LIMIT) {
    return res.status(429).json({ error: 'Terlalu banyak pendaftaran akun dari IP ini. Silakan coba lagi dalam 15 menit.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    
    db.run('INSERT INTO users (username, passwordHash, publicKey) VALUES (?, ?, ?)', 
      [cleanUser, passwordHash, publicKey], 
      function(err) {
        if (err) {
          if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username sudah digunakan orang lain' });
          }
          return res.status(400).json({ error: 'Username sudah digunakan orang lain' });
        }
        
        ipRecord.count++;
        registrationIpMap.set(clientIp, ipRecord);

        const token = jwt.sign({ userId: this.lastID, username: cleanUser }, JWT_SECRET);
        res.json({ token, username: cleanUser, userId: this.lastID });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', (req, res) => {
  const { username, password, adminPin, captchaAnswer, captchaExpected } = req.body;
  
  if (username === 'anonim') {
    if (!adminPin || adminPin !== ADMIN_PIN) {
      return res.status(403).json({ error: 'PIN Keamanan Admin tidak valid atau belum dimasukkan!' });
    }
    if (!captchaAnswer || !captchaExpected || captchaAnswer.toString().toUpperCase() !== captchaExpected.toString().toUpperCase()) {
      return res.status(400).json({ error: 'Kode Captcha Gambar Salah!' });
    }

    // Auto-create/ensure 'anonim' admin user exists in database on first login
    db.get('SELECT * FROM users WHERE username = ?', ['anonim'], async (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error: ' + (err.message || String(err)) });
      
      if (!user) {
        const passwordHash = await bcrypt.hash(password || 'admin123', 10);
        db.run('INSERT INTO users (username, passwordHash, publicKey) VALUES (?, ?, ?)', 
          ['anonim', passwordHash, req.body.publicKey || 'ADMIN_PUBLIC_KEY'], 
          function(err) {
            if (err) return res.status(500).json({ error: 'Gagal membuat akun admin di database' });
            const token = jwt.sign({ userId: this.lastID, username: 'anonim' }, JWT_SECRET);
            return res.json({ token, username: 'anonim', userId: this.lastID });
          });
      } else {
        let valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          // Sync admin password on valid PIN & Captcha authorization
          const newHash = await bcrypt.hash(password, 10);
          db.run('UPDATE users SET passwordHash = ? WHERE username = ?', [newHash, 'anonim']);
          valid = true;
        }

        if (req.body.publicKey) {
          db.run('UPDATE users SET publicKey = ? WHERE username = ?', [req.body.publicKey, 'anonim']);
        }
        
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
        return res.json({ token, username: user.username, userId: user.id });
      }
    });
    return;
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error: ' + (err.message || String(err)) });
    }
    
    if (!user) {
      const passwordHash = await bcrypt.hash(password || '123456', 10);
      const userPubKey = req.body.publicKey || null;

      db.run('INSERT INTO users (username, passwordHash, publicKey, lastSeen) VALUES (?, ?, ?, ?)', 
        [username, passwordHash, userPubKey, new Date().toISOString()], 
        function(err2) {
          if (err2) {
            console.error('[AUTO-REGISTER LOGIN ERROR]', err2);
            return res.status(500).json({ error: 'Gagal membuat akun baru di database' });
          }
          const token = jwt.sign({ userId: this.lastID || 1, username: username }, JWT_SECRET);
          return res.json({ token, username: username, userId: this.lastID || 1 });
        }
      );
      return;
    }
    
    const valid = await bcrypt.compare(password, user.passwordHash || user.passwordhash || '');
    if (!valid) return res.status(400).json({ error: 'Password salah! Periksa kembali password Anda.' });
    
    if ((user.banStatus || user.banstatus) === 'permanently_banned') {
      return res.status(403).json({ error: 'BANNED', message: 'Your account has been permanently banned.' });
    }
    
    if (req.body.publicKey) {
      db.run('UPDATE users SET publicKey = ? WHERE username = ?', [req.body.publicKey, username]);
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, username: user.username, userId: user.id });
  });
});

const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized. Token required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
  }
};

app.get('/api/messages/private/sync', authenticateUser, (req, res) => {
  const username = req.user.username;
  const since = req.query.since;
  const peer = req.query.peer;

  let query = 'SELECT * FROM private_messages WHERE (fromUser = ? OR toUser = ?)';
  let params = [username, username];

  if (peer) {
    query += ' AND (fromUser = ? OR toUser = ?)';
    params.push(peer, peer);
  }

  if (since) {
    query += ' AND timestamp > ?';
    params.push(since);
  }

  query += ' ORDER BY timestamp ASC LIMIT 500';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    const formatted = (rows || []).map(r => ({
      id: r.id,
      messageId: r.messageId || r.messageid,
      fromUser: r.fromUser || r.fromuser,
      toUser: r.toUser || r.touser,
      encryptedMessage: r.encryptedMessage || r.encryptedmessage,
      timestamp: r.timestamp,
      delivered: r.delivered,
      status: r.status
    }));
    res.json(formatted);
  });
});

app.get('/api/messages/global/sync', authenticateUser, (req, res) => {
  const since = req.query.since;
  const limit = parseInt(req.query.limit) || 100;

  let query = 'SELECT * FROM global_messages';
  let params = [];

  if (since) {
    query += ' WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?';
    params.push(since, limit);
  } else {
    query += ' ORDER BY timestamp ASC LIMIT ?';
    params.push(limit);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    const history = (rows || []).map(row => {
      try {
        return {
          messageId: row.messageId,
          from: row.sender,
          message: row.message,
          type: row.type,
          mimeType: row.mimeType,
          fileName: row.fileName,
          fileBuffer: row.type === 'media' ? row.fileBuffer : null,
          replyTo: row.replyTo ? JSON.parse(row.replyTo) : null,
          timestamp: row.timestamp,
          reactions: row.reactions ? JSON.parse(row.reactions) : {}
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json(history);
  });
});

app.get('/api/health', (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  const pool = db.getPool ? db.getPool() : null;
  
  if (!dbUrl) {
    return res.status(500).json({ status: 'ERROR', message: 'DATABASE_URL environment variable is missing' });
  }

  db.all('SELECT COUNT(*) as count FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ status: 'ERROR', dbError: err.message });
    }
    res.json({ status: 'OK', userCount: rows[0]?.count || 0, hasDbUrl: true });
  });
});

app.get('/api/users', (req, res) => {
  db.all('SELECT id, username, publicKey, avatar, lastSeen FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const formatted = (rows || []).map(r => ({
      id: r.id,
      username: r.username,
      publicKey: (r.publicKey && r.publicKey !== 'ADMIN_PUBLIC_KEY') ? r.publicKey : (r.publickey && r.publickey !== 'ADMIN_PUBLIC_KEY' ? r.publickey : null),
      avatar: r.avatar || null,
      lastSeen: r.lastSeen || r.lastseen || null
    }));
    res.json(formatted);
  });
});

app.post('/api/messages/private/send', authenticateUser, (req, res) => {
  const from = req.user.username;
  const { to, encryptedMessage, messageId } = req.body;

  if (!to || !encryptedMessage) return res.status(400).json({ error: 'Recipient and encrypted message required' });

  const finalMessageId = messageId || (Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9));
  const now = new Date().toISOString();

  db.run(
    "INSERT INTO private_messages (messageId, fromUser, toUser, encryptedMessage, timestamp, delivered, status) VALUES (?, ?, ?, ?, ?, 1, 'sent')",
    [finalMessageId, from, to, encryptedMessage, now],
    function(err) {
      if (err) {
        console.error('[DB ERROR] Failed to save private message:', err);
        return res.status(500).json({ error: 'Failed to save message to database' });
      }
      res.json({ success: true, messageId: finalMessageId, timestamp: now, status: 'sent' });
    }
  );
});

app.post('/api/messages/global/send', authenticateUser, (req, res) => {
  const from = req.user.username;
  const { message, type, mimeType, fileName, fileBuffer, replyTo, messageId } = req.body;

  const finalMessageId = messageId || (Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9));
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO global_messages (messageId, sender, message, type, mimeType, fileName, fileBuffer, replyTo, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [finalMessageId, from, message || '', type || 'text', mimeType || null, fileName || null, fileBuffer || null, replyTo ? JSON.stringify(replyTo) : null, now],
    function(err) {
      if (err) {
        console.error('[DB ERROR] Failed to save global message:', err);
        return res.status(500).json({ error: 'Failed to save global message' });
      }
      res.json({ success: true, messageId: finalMessageId, timestamp: now });
    }
  );
});

app.post(['/api/user/profile', '/api/update-avatar'], authenticateUser, async (req, res) => {
  const { avatar, publicKey } = req.body;
  const username = req.user.username;

  try {
    let finalAvatar = avatar || null;
    if (avatar && avatar.startsWith('data:image')) {
      finalAvatar = await uploadMedia(avatar, 'avatars');
    }

    if (publicKey) {
      db.run('UPDATE users SET avatar = COALESCE(?, avatar), publicKey = ? WHERE username = ?', [finalAvatar, publicKey, username], (err) => {
        if (err) {
          console.error('[DB ERROR] Failed to update profile:', err);
          return res.status(500).json({ error: 'Failed to update profile' });
        }
        res.json({ success: true, avatar: finalAvatar, publicKey });
      });
    } else {
      db.run('UPDATE users SET avatar = ? WHERE username = ?', [finalAvatar, username], (err) => {
        if (err) {
          console.error('[DB ERROR] Failed to update avatar:', err);
          return res.status(500).json({ error: 'Failed to update avatar' });
        }
        res.json({ success: true, avatar: finalAvatar });
      });
    }
  } catch (e) {
    console.error('[PROFILE UPDATE ERROR]', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const adminPin = req.headers['x-admin-pin'] || req.body?.adminPin;

  if (!adminPin || adminPin !== ADMIN_PIN) {
    return res.status(401).json({ error: 'PIN Admin tidak valid.' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.username !== 'anonim') {
      return res.status(403).json({ error: 'Akses Ditolak! Hanya akun admin (anonim) yang dapat mengakses panel ini.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau expired.' });
  }
};

app.post('/api/admin/verify-pin', (req, res) => {
  const adminPin = req.headers['x-admin-pin'] || req.body?.adminPin;
  if (adminPin === ADMIN_PIN) {
    return res.json({ success: true, message: 'PIN Admin valid.' });
  }
  return res.status(401).json({ error: 'PIN Admin tidak valid.' });
});

app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  db.all('SELECT id, username, publicKey, avatar, lastSeen, banStatus, banExpiresAt FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows || []);
  });
});

app.post('/api/admin/ban', authenticateAdmin, (req, res) => {
  const { username, banType, durationHours } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (username === 'anonim') return res.status(403).json({ error: 'Cannot ban admin user' });

  let banStatus = 'active';
  let banExpiresAt = null;

  if (banType === 'permanent') {
    banStatus = 'permanently_banned';
  } else if (banType === 'temporary') {
    banStatus = 'temp_banned';
    const hours = parseInt(durationHours) || 24;
    const expires = new Date();
    expires.setHours(expires.getHours() + hours);
    banExpiresAt = expires.toISOString();
  }

  db.run('UPDATE users SET banStatus = ?, banExpiresAt = ? WHERE username = ?', [banStatus, banExpiresAt, username], (err) => {
    if (err) return res.status(500).json({ error: 'Database update error' });
    res.json({ success: true, message: `User ${username} has been banned.` });
  });
});

app.post('/api/admin/unban', authenticateAdmin, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  db.run('UPDATE users SET banStatus = "active", banExpiresAt = NULL WHERE username = ?', [username], (err) => {
    if (err) return res.status(500).json({ error: 'Database update error' });
    res.json({ success: true, message: `User ${username} unbanned.` });
  });
});

module.exports = (req, res) => {
  return app(req, res);
};
