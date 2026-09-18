let app;
let initErr = null;

try {
  const express = require('express');
  const cors = require('cors');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const path = require('path');
  const helmet = require('helmet');

  app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const db = require('./db');
  const { uploadMedia } = require('./cloudinary');

  const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-whatsapp-key-123';
  const ADMIN_PIN = process.env.ADMIN_PIN || '123458';

  const registrationIpMap = new Map();

  app.post('/register', async (req, res) => {
    const { username, password, publicKey } = req.body;
    if (!username || !password || !publicKey) {
      return res.status(400).json({ error: 'Semua kolom wajib diisi' });
    }
    const cleanUser = username.trim();
    if (cleanUser.length < 3 || cleanUser.length > 20) {
      return res.status(400).json({ error: 'Username harus 3 - 20 karakter.' });
    }
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      db.run('INSERT INTO users (username, passwordHash, publicKey) VALUES (?, ?, ?)', 
        [cleanUser, passwordHash, publicKey], 
        function(err) {
          if (err) {
            return res.status(400).json({ error: 'Username sudah digunakan orang lain' });
          }
          const token = jwt.sign({ userId: this.lastID, username: cleanUser }, JWT_SECRET);
          res.json({ token, username: cleanUser });
        });
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });
    const cleanUser = username.trim();
    db.get('SELECT * FROM users WHERE username = ?', [cleanUser], async (err, user) => {
      if (err || !user) return res.status(400).json({ error: 'Username atau password salah' });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(400).json({ error: 'Username atau password salah' });
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
      res.json({ token, username: user.username, publicKey: user.publicKey, avatar: user.avatar });
    });
  });

  app.get('/api/users', (req, res) => {
    db.all('SELECT id, username, publicKey, avatar, lastSeen FROM users', [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows || []);
    });
  });

  app.post('/api/admin/verify-pin', (req, res) => {
    const adminPin = req.headers['x-admin-pin'] || req.body?.adminPin;
    if (adminPin === ADMIN_PIN) {
      return res.json({ success: true, message: 'PIN Admin valid.' });
    }
    return res.status(401).json({ error: 'PIN Admin tidak valid.' });
  });

} catch (err) {
  initErr = { message: err.message, stack: err.stack, name: err.name };
}

module.exports = (req, res) => {
  if (initErr) {
    return res.status(500).json({ error: 'Initialization Error', details: initErr });
  }
  return app(req, res);
};
