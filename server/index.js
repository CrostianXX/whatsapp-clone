const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const helmet = require('helmet');

const app = express();

// Secure Express headers (Fix for Nuclei vulnerability scan)
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
app.use(express.json({ limit: '10mb' })); // To parse JSON bodies

const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 5e7, // 50 MB
  pingTimeout: 30000,
  pingInterval: 10000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true
});


const JWT_SECRET = 'super-secret-whatsapp-key-123'; // In production, use environment variable

// Database & Cloudinary Helpers
const db = require('./db');
const { uploadMedia } = require('./cloudinary');

const ADMIN_PIN = process.env.ADMIN_PIN || '123458';

// Anti-Spam Registration Rate Limiter (Max 3 accounts per IP per 15 minutes)
const registrationIpMap = new Map();
const REGISTRATION_LIMIT = 3;
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;

// Active socket sessions map (socketId -> session details)
const activeSessions = new Map();

// Auth Routes
app.post('/register', async (req, res) => {
  const { username, password, publicKey } = req.body;
  if (!username || !password || !publicKey) {
    return res.status(400).json({ error: 'Semua kolom wajib diisi' });
  }

  const cleanUser = username.trim();

  // Validate username & password formatting
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

  // Rate Limiting per IP
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
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username sudah digunakan orang lain' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        // Increment IP registration counter
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
  console.log(`[LOGIN ATTEMPT] username: '${username}', password length: ${password ? password.length : 0}`);
  
  if (username === 'anonim') {
    if (!adminPin || adminPin !== ADMIN_PIN) {
      return res.status(403).json({ error: 'PIN Keamanan Admin tidak valid atau belum dimasukkan!' });
    }
    if (!captchaAnswer || !captchaExpected || captchaAnswer.toString().toUpperCase() !== captchaExpected.toString().toUpperCase()) {
      return res.status(400).json({ error: 'Kode Captcha Gambar Salah!' });
    }
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      console.log(`[LOGIN DB ERROR]`, err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      console.log(`[LOGIN FAILED] user not found`);
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    console.log(`[LOGIN] Found user, comparing password...`);
    const valid = await bcrypt.compare(password, user.passwordHash);
    console.log(`[LOGIN] bcrypt.compare result:`, valid);
    
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    
    if (user.banStatus === 'permanently_banned') {
      return res.status(403).json({ error: 'BANNED', message: 'Your account has been permanently banned.' });
    }
    
    if (user.banStatus === 'temp_banned' && user.banExpiresAt) {
      if (new Date() < new Date(user.banExpiresAt)) {
        return res.status(403).json({ error: 'TEMP_BANNED', message: `Your account is temporarily banned until ${new Date(user.banExpiresAt).toLocaleString()}` });
      } else {
        // Ban expired, remove it
        db.run('UPDATE users SET banStatus = "active", banExpiresAt = NULL WHERE id = ?', [user.id]);
      }
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, username: user.username, userId: user.id });
  });
});

// User Authentication Middleware (Requires valid JWT token)
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized. Token required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
  }
};

// Sync Private Messages for Authenticated User
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
      console.error("[DB ERROR] Sync private messages:", err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows || []);
  });
});

// Sync Global Messages
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
      console.error("[DB ERROR] Sync global messages:", err);
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
        return {
          messageId: row.messageId,
          from: row.sender,
          message: row.message,
          type: row.type || 'text',
          timestamp: row.timestamp,
          reactions: {}
        };
      }
    });
    res.json(history);
  });
});

// Get Unread Message Counts per Chat for Authenticated User
app.get('/api/messages/unread-counts', authenticateUser, (req, res) => {
  const username = req.user.username;
  const unreadMap = {};

  // Private Unread Counts (where toUser = username and status != 'read')
  db.all(
    'SELECT fromUser, COUNT(*) as count FROM private_messages WHERE toUser = ? AND status != "read" GROUP BY fromUser',
    [username],
    (err, privateRows) => {
      if (!err && privateRows) {
        privateRows.forEach(row => {
          unreadMap[row.fromUser] = row.count;
        });
      }

      // Global Unread Count (global messages not sent by me and not in global_message_reads)
      db.get(
        'SELECT COUNT(*) as count FROM global_messages WHERE sender != ? AND messageId NOT IN (SELECT messageId FROM global_message_reads WHERE username = ?)',
        [username, username],
        (err2, globalRow) => {
          if (!err2 && globalRow) {
            unreadMap['global'] = globalRow.count || 0;
          } else {
            unreadMap['global'] = 0;
          }
          res.json(unreadMap);
        }
      );
    }
  );
});

// Mark Room Messages as Read
app.post('/api/messages/read', authenticateUser, (req, res) => {
  const username = req.user.username;
  const { room, messageIds } = req.body;

  if (!room) return res.status(400).json({ error: 'Room required' });

  const now = new Date().toISOString();

  if (room === 'global') {
    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      const stmt = db.prepare('INSERT OR IGNORE INTO global_message_reads (messageId, username) VALUES (?, ?)');
      messageIds.forEach(id => stmt.run(id, username));
      stmt.finalize(() => {
        res.json({ success: true });
      });
    } else {
      db.all('SELECT messageId FROM global_messages', (err, rows) => {
        if (!err && rows && rows.length > 0) {
          const stmt = db.prepare('INSERT OR IGNORE INTO global_message_reads (messageId, username) VALUES (?, ?)');
          rows.forEach(r => stmt.run(r.messageId, username));
          stmt.finalize();
        }
        res.json({ success: true });
      });
    }
  } else {
    // Mark private chat messages as read
    db.run(
      'UPDATE private_messages SET status = "read", readAt = ? WHERE toUser = ? AND fromUser = ? AND status != "read"',
      [now, username, room],
      function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });

        // Notify sender via Socket.IO
        io.to(room).emit('message_status_update', {
          from: username,
          to: room,
          status: 'read'
        });

        res.json({ success: true, updatedCount: this.changes });
      }
    );
  }
});

// REST Fallback for Sending Private Message
app.post('/api/messages/private/send', authenticateUser, (req, res) => {
  const from = req.user.username;
  const { to, encryptedMessage, messageId } = req.body;

  if (!to || !encryptedMessage) return res.status(400).json({ error: 'Recipient and encrypted message required' });

  const finalMessageId = messageId || (Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9));
  const now = new Date().toISOString();
  const recipientRoom = io.sockets.adapter.rooms.get(to);
  const isOnline = recipientRoom && recipientRoom.size > 0;
  const initialStatus = isOnline ? 'delivered' : 'sent';

  db.run(
    'INSERT OR IGNORE INTO private_messages (messageId, fromUser, toUser, encryptedMessage, timestamp, delivered, status, deliveredAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [finalMessageId, from, to, encryptedMessage, now, isOnline ? 1 : 0, initialStatus, isOnline ? now : null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to save message to database' });

      // Relay to online sockets of recipient
      io.to(to).emit('private_message', {
        from,
        encryptedMessage,
        messageId: finalMessageId,
        timestamp: now,
        status: initialStatus
      });

      res.json({ success: true, messageId: finalMessageId, timestamp: now, status: initialStatus });
    }
  );
});

// Admin Middleware (Requires JWT Token + Secret Admin PIN Header)
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const adminPin = req.headers['x-admin-pin'] || req.body?.adminPin;
  
  if (!token) return res.status(401).json({ error: 'Unauthorized. Token required.' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.username !== 'anonim') {
      return res.status(403).json({ error: 'Akses Ditolak. Khusus Akun Admin.' });
    }

    if (!adminPin || adminPin !== ADMIN_PIN) {
      return res.status(403).json({ error: 'PIN Keamanan Admin tidak valid atau belum dimasukkan.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token tidak valid' });
  }
};

// Verify Admin PIN endpoint
app.post('/api/admin/verify-pin', authenticateAdmin, (req, res) => {
  res.json({ success: true, message: 'PIN Keamanan Admin terverifikasi.' });
});

// Admin Endpoints
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  db.all('SELECT id, username, lastSeen, banStatus, banExpiresAt FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Get Active Online Sessions for Admin Account (Remote Session Management for 'anonim')
app.get('/api/admin/sessions', authenticateAdmin, (req, res) => {
  const adminSessions = [];
  for (const [socketId, session] of activeSessions.entries()) {
    if (session.username === 'anonim') {
      adminSessions.push({
        socketId: session.socketId,
        username: session.username,
        ip: session.ip || '127.0.0.1',
        userAgent: session.userAgent || 'Unknown Device',
        connectedAt: session.connectedAt || new Date().toISOString()
      });
    }
  }
  res.json(adminSessions);
});

// Kick / Remote Logout Admin Session
app.post('/api/admin/kick-session', authenticateAdmin, (req, res) => {
  const { socketId } = req.body;
  if (!socketId) return res.status(400).json({ error: 'Socket ID required' });
  
  const session = activeSessions.get(socketId);
  if (session) {
    io.to(socketId).emit('force_disconnect', { message: 'Sesi Admin Anda telah diputus/di-logout secara remote.' });
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.disconnect(true);
    
    activeSessions.delete(socketId);
    return res.json({ success: true, message: 'Sesi perangkat Admin berhasil di-kick.' });
  }
  
  res.status(404).json({ error: 'Sesi perangkat tidak ditemukan atau sudah tidak aktif.' });
});

app.post('/api/admin/ban', authenticateAdmin, (req, res) => {
  const { username, type, durationHours } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  let banStatus = 'permanently_banned';
  let banExpiresAt = null;
  
  if (type === 'temp') {
    banStatus = 'temp_banned';
    const expires = new Date();
    expires.setHours(expires.getHours() + (parseFloat(durationHours) || 24));
    banExpiresAt = expires.toISOString();
  }
  
  db.run('UPDATE users SET banStatus = ?, banExpiresAt = ? WHERE username = ?', [banStatus, banExpiresAt, username], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    // Force disconnect if online
    const userData = activeUsers.get(username);
    if (userData && userData.socketId) {
      io.to(userData.socketId).emit('force_disconnect', { message: 'You have been banned by an admin.' });
      const socket = io.sockets.sockets.get(userData.socketId);
      if (socket) socket.disconnect(true);
      activeUsers.delete(username);
    }
    
    if (typeof broadcastUserList === 'function') broadcastUserList();
    
    res.json({ success: true, message: `User ${username} banned.` });
  });
});

app.post('/api/admin/unban', authenticateAdmin, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  db.run('UPDATE users SET banStatus = "active", banExpiresAt = NULL WHERE username = ?', [username], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (typeof broadcastUserList === 'function') broadcastUserList();
    res.json({ success: true, message: `User ${username} unbanned.` });
  });
});

app.post('/api/admin/clear-global', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM global_messages', function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    // Tell all connected clients to clear their global history
    io.emit('clear_global_history');
    res.json({ success: true, message: 'Global chat cleared.' });
  });
});

const puppeteer = require('puppeteer');

// Pinterest Scraper with Puppeteer (Direct Pinterest, Tall Viewport bypass)
app.get('/api/images/search', async (req, res) => {
  const query = req.query.q || 'aesthetic';
  
  // Implement Server-Sent Events (SSE)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Flush headers immediately
  res.flushHeaders && res.flushHeaders();
  
  let browser = null;
  try {
    browser = await puppeteer.launch({ 
      headless: 'new', 
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    
    // Optimasi super cepat: Blokir download gambar/css asli, kita cuma butuh DOM img.src-nya!
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setViewport({ width: 1920, height: 2500 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    // To bypass the 25 image limit, we search for multiple variations of the query
    const suffixes = ['', ' aesthetic', ' cute', ' icon', ' ootd', ' wallpaper', ' selca', ' photoshoot'];
    const seen = new Set();
    
    for (const suffix of suffixes) {
      const currentQuery = query + suffix;
      
      try {
        await page.goto(`https://id.pinterest.com/search/pins/?q=${encodeURIComponent(currentQuery)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1500)); // Wait for render
        
        const images = await page.evaluate(() => {
          const imgElements = document.querySelectorAll('img');
          const results = [];
          imgElements.forEach(img => {
            const src = img.src;
            if (src && src.includes('pinimg.com')) {
               const resMatch = src.match(/\/(\d+)x(?:\d+)?\//);
               if ((resMatch && parseInt(resMatch[1]) >= 200) || src.includes('/originals/')) {
                 results.push(src);
               }
            }
          });
          return results;
        });
        
        const newImages = [];
        for (const src of images) {
          const hiResSrc = src.replace(/\/\d+x(?:\d+)?\//, '/736x/');
          if (!seen.has(hiResSrc)) {
            seen.add(hiResSrc);
            newImages.push({
              id: hiResSrc,
              url: hiResSrc,
              thumb: src,
              author: 'Pinterest User',
              authorLink: '#'
            });
          }
        }
        
        if (newImages.length > 0) {
          // Send chunk to client
          res.write(`data: ${JSON.stringify({ images: newImages })}\n\n`);
        }
        
      } catch (e) {
        console.error(`Error in chunk ${currentQuery}:`, e);
      }
    }
    
    // Signal end of stream
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    
  } catch (err) {
    console.error('Pinterest search error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Failed to search Pinterest' })}\n\n`);
    res.end();
  } finally {
    if (browser) await browser.close();
  }
});

// Image Download Proxy (CORS bypass)
app.get('/api/images/download', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).json({ error: 'URL required' });
  
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('Image download error:', err);
    res.status(500).json({ error: 'Failed to download image' });
  }
});

// Update Avatar endpoint
app.post('/api/update-avatar', authenticateUser, async (req, res) => {
  const username = req.user.username;
  const { avatar } = req.body;
  
  if (!avatar) {
    return res.status(400).json({ error: 'Avatar image is required' });
  }

  const uploadedAvatarUrl = await uploadMedia(avatar, 'avatars');

  db.run("UPDATE users SET avatar = ? WHERE username = ?", [uploadedAvatarUrl, username], function(err) {
    if (err) {
      console.error("[DB ERROR] Failed to update avatar:", err);
      return res.status(500).json({ error: 'Failed to update avatar' });
    }
    
    // Broadcast updated user list to everyone
    broadcastUserList();
    res.json({ success: true, avatar: uploadedAvatarUrl });
  });
});

// Map of username -> socket.id for active routing
const activeUsers = new Map();

// Helper to get active users list
const getUserList = (cb) => {
  db.all("SELECT username, publicKey, avatar, lastSeen FROM users", (err, rows) => {
    if (err) {
      console.error("getUserList Error:", err);
      return cb ? cb([]) : null;
    }
    
    const allUsers = rows.map(row => {
      const room = io.sockets.adapter.rooms.get(row.username);
      const isOnline = (room && room.size > 0) || activeUsers.has(row.username);
      let avatar = row.avatar;
      // Allow base64 avatars up to 200KB
      if (avatar && avatar.length > 200000) {
        avatar = null;
      }
      return {
        username: row.username,
        publicKey: row.publicKey,
        avatar: avatar,
        lastSeen: row.lastSeen,
        status: isOnline ? 'online' : 'offline'
      };
    });
    if (cb) cb(allUsers);
  });
};

// Public REST endpoint for user list
app.get('/api/users', (req, res) => {
  getUserList((allUsers) => {
    res.json(allUsers);
  });
});

// Helper to broadcast active users (only usernames, public keys, and avatars)
// Debounced to prevent flooding when many sockets connect/disconnect rapidly
let broadcastTimer = null;
const broadcastUserList = () => {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    getUserList((allUsers) => {
      io.emit('users_list', allUsers);
    });
  }, 300); // 300ms debounce
};



io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.username = decoded.username;
      socket.join(decoded.username);
    } catch (err) {
      // Token invalid or unauthenticated, ignore
    }
  }
  next();
});

io.on('connection', (socket) => {

  socket.on('error', (err) => {
    console.error(`Socket ${socket.id} error:`, err.message);
  });

  // Handle user joining (authenticating their socket)
  socket.on('join', (username) => {
    if (!username) return;
    const isRejoin = socket.username === username && socket.hasJoined;
    console.log(`[JOIN] ${username} joined with socket ${socket.id} (isRejoin: ${isRejoin})`);
    socket.username = username;
    socket.join(username); // Join socket room for this user


    const clientIp = socket.handshake.address || socket.request?.connection?.remoteAddress || '127.0.0.1';
    const userAgent = socket.handshake.headers['user-agent'] || 'Browser';

    // Register active user IMMEDIATELY (0ms sync) so private messages route without waiting for DB
    activeUsers.set(username, {
      socketId: socket.id,
      username: username,
      status: 'online',
      ip: clientIp,
      userAgent: userAgent,
      connectedAt: new Date().toISOString()
    });

    activeSessions.set(socket.id, {
      socketId: socket.id,
      username: username,
      ip: clientIp,
      userAgent: userAgent,
      connectedAt: new Date().toISOString()
    });

    // Send user list directly to the joining client IMMEDIATELY
    getUserList((allUsers) => {
      socket.emit('users_list', allUsers);
    });

    broadcastUserList();

    db.get('SELECT id, username, publicKey, banStatus, banExpiresAt FROM users WHERE username = ?', [username], (err, user) => {
      if (user) {
        if (user.banStatus === 'permanently_banned') {
          socket.emit('force_disconnect', { message: 'Your account has been permanently banned.' });
          socket.disconnect(true);
          activeUsers.delete(username);
          activeSessions.delete(socket.id);
          return;
        }
        
        if (user.banStatus === 'temp_banned' && user.banExpiresAt) {
          if (new Date() < new Date(user.banExpiresAt)) {
            socket.emit('force_disconnect', { message: `Your account is temporarily banned until ${new Date(user.banExpiresAt).toLocaleString()}` });
            socket.disconnect(true);
            activeUsers.delete(username);
            activeSessions.delete(socket.id);
            return;
          } else {
            db.run('UPDATE users SET banStatus = "active", banExpiresAt = NULL WHERE id = ?', [user.id]);
          }
        }

        // Update public key in activeUsers
        const currentActive = activeUsers.get(username);
        if (currentActive) {
          currentActive.publicKey = user.publicKey;
        }

        // Send global chat history to the newly joined user (only once per socket session)
        if (!socket.hasJoined) {
          socket.hasJoined = true;
          db.all('SELECT * FROM global_messages ORDER BY timestamp ASC LIMIT 100', (err, rows) => {
            if (!err && rows) {
              const history = [];
              for (const row of rows) {
                try {
                  history.push({
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
                  });
                } catch (parseErr) {
                  console.error("Error parsing global message row:", row.messageId, parseErr.message);
                  history.push({
                    messageId: row.messageId,
                    from: row.sender,
                    message: row.message,
                    type: row.type || 'text',
                    mimeType: null,
                    fileName: null,
                    fileBuffer: null,
                    replyTo: null,
                    timestamp: row.timestamp,
                    reactions: {}
                  });
                }
              }
              socket.emit('global_history', history);
            }
          });
        }

        // Deliver any pending offline private messages
        db.all(
          'SELECT * FROM private_messages WHERE toUser = ? AND delivered = 0 ORDER BY timestamp ASC',
          [username],
          (err, pendingMsgs) => {
            if (!err && pendingMsgs && pendingMsgs.length > 0) {
              console.log(`Delivering ${pendingMsgs.length} offline messages to ${username}`);
              pendingMsgs.forEach(pm => {
                socket.emit('private_message', {
                  from: pm.fromUser,
                  encryptedMessage: pm.encryptedMessage,
                  messageId: pm.messageId,
                  timestamp: pm.timestamp
                });
              });
              const ids = pendingMsgs.map(pm => pm.messageId);
              if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                db.run(`UPDATE private_messages SET delivered = 1 WHERE messageId IN (${placeholders})`, ids);
              }
            }
          }
        );
      } else {
        // Fallback for non-banned users not found in users table yet
        db.all(
          'SELECT * FROM private_messages WHERE toUser = ? AND delivered = 0 ORDER BY timestamp ASC',
          [username],
          (err, pendingMsgs) => {
            if (!err && pendingMsgs && pendingMsgs.length > 0) {
              console.log(`Delivering ${pendingMsgs.length} offline messages to ${username}`);
              pendingMsgs.forEach(pm => {
                socket.emit('private_message', {
                  from: pm.fromUser,
                  encryptedMessage: pm.encryptedMessage,
                  messageId: pm.messageId,
                  timestamp: pm.timestamp
                });
              });
              const ids = pendingMsgs.map(pm => pm.messageId);
              if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                db.run(`UPDATE private_messages SET delivered = 1 WHERE messageId IN (${placeholders})`, ids);
              }
            }
          }
        );
      }
    });
  });

  // Handle Private Messaging (E2EE) using Socket Room Broadcasting
  socket.on('private_message', (data) => {
    const t1 = Date.now();
    const { to, encryptedMessage, from, messageId, t0 = t1 } = data;
    const now = new Date().toISOString();
    const finalMessageId = messageId || (Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9));

    const recipientRoom = io.sockets.adapter.rooms.get(to);
    const isOnline = recipientRoom && recipientRoom.size > 0;
    const initialStatus = isOnline ? 'delivered' : 'sent';

    let t2 = t1;
    // Store in DB with status
    db.run(
      'INSERT OR IGNORE INTO private_messages (messageId, fromUser, toUser, encryptedMessage, timestamp, delivered, status, deliveredAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [finalMessageId, from, to, encryptedMessage, now, isOnline ? 1 : 0, initialStatus, isOnline ? now : null],
      (err) => {
        t2 = Date.now();
        if (err) console.error("[DB ERROR] Save private message:", err);
        else console.log(`[TIMING SERVER] Private Msg ${finalMessageId} | T1-T0: ${t1 - t0}ms | DB T2-T1: ${t2 - t1}ms`);
      }
    );

    const t3 = Date.now();

    // Relay IMMEDIATELY to room `to` (delivers to all active sockets of user `to`)
    console.log(`Relaying E2EE message ${finalMessageId} from ${from} to room ${to} (online: ${isOnline}).`);
    io.to(to).emit('private_message', {
      from: from,
      to: to,
      encryptedMessage: encryptedMessage,
      messageId: finalMessageId,
      timestamp: now,
      status: initialStatus,
      t0,
      t1,
      t3
    });

    // Notify sender of status update
    socket.emit('message_status_update', {
      messageId: finalMessageId,
      status: initialStatus,
      from: to,
      to: from
    });
  });

  // Handle ACK when recipient actually receives private message
  socket.on('message_received_ack', ({ messageId, from }) => {
    if (!messageId) return;
    const now = new Date().toISOString();
    db.run('UPDATE private_messages SET delivered = 1, status = "delivered", deliveredAt = ? WHERE messageId = ? AND status = "sent"', [now, messageId]);
    
    if (from) {
      io.to(from).emit('message_status_update', {
        messageId,
        status: 'delivered',
        from: socket.username || 'user'
      });
    }
  });

  socket.on('typing', (data) => {
    const { to, isTyping, from } = data;
    io.to(to).emit('user_typing', { username: from, isTyping });
  });

  socket.on('message_status_update', (data) => {
    const { to, messageId, status, from } = data;
    const now = new Date().toISOString();

    if (messageId && status) {
      if (status === 'read') {
        db.run('UPDATE private_messages SET status = "read", readAt = ? WHERE messageId = ?', [now, messageId]);
      } else if (status === 'delivered') {
        db.run('UPDATE private_messages SET status = "delivered", deliveredAt = ? WHERE messageId = ? AND status = "sent"', [now, messageId]);
      }
    }

    io.to(to).emit('message_status_update', {
      messageId,
      status,
      from,
      to
    });
  });


  // Track who has read a global message
  socket.on('global_message_read', ({ messageId, username }) => {
    db.run(
      'INSERT OR IGNORE INTO global_message_reads (messageId, username) VALUES (?, ?)',
      [messageId, username],
      (err) => {
        if (!err) {
          db.get(
            'SELECT COUNT(*) as readCount FROM global_message_reads WHERE messageId = ?',
            [messageId],
            (err2, row) => {
              if (!err2) {
                db.get('SELECT COUNT(*) as total FROM users', (err3, usersRow) => {
                  const totalUsers = usersRow ? usersRow.total : 0;
                  io.emit('global_message_read_update', {
                    messageId,
                    readCount: row ? row.readCount : 0,
                    totalUsers
                  });
                });
              }
            }
          );
        }
      }
    );
  });

  // Handle Public Messaging (Global Server Room)
  socket.on('public_message', async (data) => {
    const t1 = Date.now();
    let { from, message, type, mimeType, fileName, fileBuffer, replyTo, messageId, t0 = t1 } = data;
    const finalMessageId = messageId || (Date.now().toString() + Math.random());
    const now = new Date().toISOString();
    
    // Upload media to Cloudinary if configured
    if (type === 'media' && fileBuffer) {
      fileBuffer = await uploadMedia(fileBuffer, 'global_chat');
    }

    const t3 = Date.now();
    // 1. Broadcast to ALL OTHER clients (sender already has optimistic local copy)
    socket.broadcast.emit('public_message', {
      from, 
      message, 
      type: type || 'text', 
      mimeType: mimeType || null, 
      fileName: fileName || null, 
      fileBuffer: fileBuffer || null, 
      replyTo: replyTo || null,
      timestamp: now,
      messageId: finalMessageId,
      readCount: 0,
      totalUsers: activeUsers.size,
      t0,
      t1,
      t3
    });

    // 2. Persist to DB in background without blocking socket delivery
    db.run(
      'INSERT INTO global_messages (messageId, sender, message, type, mimeType, fileName, fileBuffer, replyTo, timestamp, reactions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [finalMessageId, from, message || null, type || 'text', mimeType || null, fileName || null, fileBuffer || null, replyTo ? JSON.stringify(replyTo) : null, now, '{}'],
      (err) => {
        const t2 = Date.now();
        if (err) console.error("Error saving global_message:", err);
        else console.log(`[TIMING SERVER] Global Msg ${finalMessageId} | T1-T0: ${t1 - t0}ms | DB T2-T1: ${t2 - t1}ms`);
      }
    );
  });

  // Handle Message Deletion
  socket.on('delete_message', (data) => {
    const { to, messageId, from, originalSender } = data;
    
    console.log(`[DELETE] Request from ${from} to delete msg ${messageId} in room ${to}`);

    // Verify permissions: only admin can delete
    if (from !== 'anonim') {
      console.log(`[DELETE] Unauthorized. Only admin can delete. from: ${from}`);
      return; // Unauthorized
    }

    if (to === 'global') {
      console.log(`[DELETE] Broadcasting to global room`);
      db.run('DELETE FROM global_messages WHERE messageId = ?', [messageId], (err) => {
        if (!err) {
          io.emit('message_deleted', { to: 'global', messageId });
        }
      });
    } else {
      // Relay to the other person
      const recipient = activeUsers.get(to);
      if (recipient) {
        console.log(`[DELETE] Relaying to private recipient ${to}`);
        io.to(recipient.socketId).emit('message_deleted', { to: from, messageId });
      } else {
        console.log(`[DELETE] Recipient ${to} not found in activeUsers`);
      }
    }
  });

  socket.on('reaction', ({ to, messageId, emoji, from }) => {
    if (to === 'global') {
      db.get('SELECT reactions FROM global_messages WHERE messageId = ?', [messageId], (err, row) => {
        if (row) {
          const reactions = row.reactions ? JSON.parse(row.reactions) : {};
          if (reactions[from] === emoji) {
             delete reactions[from]; // toggle off
          } else {
             reactions[from] = emoji; // set or change
          }
          db.run('UPDATE global_messages SET reactions = ? WHERE messageId = ?', [JSON.stringify(reactions), messageId], (err) => {
             if (!err) io.emit('message_reaction', { to: 'global', messageId, reactions });
          });
        }
      });
    } else {
      // E2EE reaction routing
      const recipient = activeUsers.get(to);
      if (recipient) {
        io.to(recipient.socketId).emit('message_reaction', { to, messageId, emoji, from });
      }
      // Since sender might be listening for acknowledgment:
      socket.emit('message_reaction', { to, messageId, emoji, from });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id} | Reason: ${reason}`);
    
    activeSessions.delete(socket.id);

    const disconnectedUser = socket.username;
    if (disconnectedUser) {
      const room = io.sockets.adapter.rooms.get(disconnectedUser);
      const remainingCount = room ? room.size : 0;
      if (remainingCount === 0) {
        activeUsers.delete(disconnectedUser);
        const now = new Date().toISOString();
        db.run("UPDATE users SET lastSeen = ? WHERE username = ?", [now, disconnectedUser], (err) => {
          if (err) console.error("Failed to update lastSeen", err);
          broadcastUserList();
        });
      }
    }
  });


});

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*path', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;

