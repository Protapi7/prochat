require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { initDb, clearAllData } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-development-key';

// Socket.io Real-time Connected Users
const connectedUsers = new Map(); // string userId -> Set of socketIds

function notifyFriendUpdate(userAId, userBId) {
  const socketsA = connectedUsers.get(String(userAId));
  if (socketsA) {
    for (const sid of socketsA) {
      io.to(sid).emit('friend_request_accepted');
    }
  }
  const socketsB = connectedUsers.get(String(userBId));
  if (socketsB) {
    for (const sid of socketsB) {
      io.to(sid).emit('friend_request_accepted');
    }
  }
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};

let db;

initDb().then(pool => {
  db = pool;
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// REST API Routes

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    server: 'ProChat Live Server'
  });
});

app.get('/api/server-info', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    status: 'online',
    port: PORT,
    localIp,
    localUrl: `http://localhost:${PORT}`,
    networkUrl: `http://${localIp}:${PORT}`,
    uptime: process.uptime()
  });
});

// Clear Entire Database Endpoint
app.post('/api/admin/clear-db', async (req, res) => {
  try {
    await clearAllData();
    res.json({ success: true, message: 'All database data cleared successfully.' });
  } catch (error) {
    console.error('Clear database error:', error);
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    let { username, email, phone, password, publicKey } = req.body;
    if (!username || !password || !publicKey) {
      return res.status(400).json({ error: 'Username, password and public key are required' });
    }

    username = username.trim();
    email = email && email.trim() ? email.trim().toLowerCase() : null;
    phone = phone && phone.trim() ? phone.trim().replace(/[\s-]/g, '') : null;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Please provide either an Email ID or Mobile Number (or both)' });
    }

    // Check for existing duplicates
    if (email) {
      const existingEmail = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (existingEmail.rows.length > 0) {
        return res.status(409).json({ error: 'This Email ID is already registered. Please log in.' });
      }
    }

    if (phone) {
      const existingPhone = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (existingPhone.rows.length > 0) {
        return res.status(409).json({ error: 'This Mobile Number is already registered. Please log in.' });
      }
    }

    const existingUser = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      'INSERT INTO users (username, email, phone, password_hash, public_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [username, email, phone, passwordHash, publicKey]
    );

    const userId = result.rows[0].id || result.insertId;
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({ 
      message: 'User registered successfully', 
      userId,
      username,
      email,
      phone,
      token 
    });
  } catch (error) {
    if (error.code === '23505' || (error.message && error.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ error: 'User with this Username, Email or Mobile Number already exists.' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, username, password } = req.body;
    const rawLoginKey = (identifier || username || '').trim();

    if (!rawLoginKey || !password) {
      return res.status(400).json({ error: 'Please enter your Mobile Number, Email ID, or Username and Password.' });
    }

    const normalizedKey = rawLoginKey.toLowerCase();
    const phoneKey = rawLoginKey.replace(/[\s-]/g, '');
    
    // Look up by Mobile Number, Email, or Username
    const result = await db.query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR (email IS NOT NULL AND LOWER(email) = $1) OR (phone IS NOT NULL AND phone = $2)',
      [normalizedKey, phoneKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found. Check your Mobile Number, Email ID or Username.' });
    }
    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      message: 'Login successful', 
      userId: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      publicKey: user.public_key,
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:username/key', async (req, res) => {
  try {
    const result = await db.query('SELECT public_key FROM users WHERE LOWER(username) = LOWER($1)', [req.params.username]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ publicKey: result.rows[0].public_key });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get list of friends (only accepted friends + offline message partners)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.phone, u.public_key
       FROM users u
       WHERE u.id != $1 AND (
         u.id IN (
           SELECT receiver_id FROM friend_requests WHERE sender_id = $1 AND status = 'accepted'
           UNION
           SELECT sender_id FROM friend_requests WHERE receiver_id = $1 AND status = 'accepted'
         )
         OR u.id IN (
           SELECT sender_id FROM offline_messages WHERE recipient_id = $1
           UNION
           SELECT recipient_id FROM offline_messages WHERE sender_id = $1
         )
       )`,
      [currentUserId]
    );
    const usersList = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
      publicKey: u.public_key,
      isOnline: connectedUsers.has(String(u.id)) && connectedUsers.get(String(u.id)).size > 0
    }));
    res.json(usersList);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users to add as friends
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const rawQ = req.query.q ? req.query.q.trim() : '';
    const cleanQ = rawQ.replace(/^@/, '').toLowerCase();
    const phoneQ = rawQ.replace(/[\s-+()]/g, '');

    let queryText = '';
    let queryParams = [];

    if (!cleanQ) {
      // If query is empty, return all registered users (up to 30) for instant discovery
      queryText = `SELECT id, username, email, phone FROM users WHERE id != $1 ORDER BY id DESC LIMIT 30`;
      queryParams = [req.user.userId];
    } else {
      queryText = `SELECT id, username, email, phone FROM users
       WHERE id != $1 AND (
         LOWER(username) LIKE $2
         OR (email IS NOT NULL AND LOWER(email) LIKE $2)
         OR (phone IS NOT NULL AND phone LIKE $3)
       )
       LIMIT 30`;
      queryParams = [req.user.userId, `%${cleanQ}%`, `%${phoneQ}%`];
    }

    const result = await db.query(queryText, queryParams);

    const relResult = await db.query(
      `SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE sender_id = $1 OR receiver_id = $1`,
      [req.user.userId]
    );

    const relMap = new Map();
    for (const rel of relResult.rows) {
      const otherId = rel.sender_id === req.user.userId ? rel.receiver_id : rel.sender_id;
      relMap.set(otherId, {
        requestId: rel.id,
        status: rel.status,
        isSender: rel.sender_id === req.user.userId
      });
    }

    const mapped = result.rows.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
      relation: relMap.get(u.id) || { status: 'none' },
      isOnline: connectedUsers.has(String(u.id)) && connectedUsers.get(String(u.id)).size > 0
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get incoming and outgoing pending friend requests
app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const incomingResult = await db.query(
      `SELECT fr.id, fr.status, fr.created_at, u.id as user_id, u.username, u.email, u.phone
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.receiver_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [currentUserId]
    );

    const outgoingResult = await db.query(
      `SELECT fr.id, fr.status, fr.created_at, u.id as user_id, u.username, u.email, u.phone
       FROM friend_requests fr
       JOIN users u ON fr.receiver_id = u.id
       WHERE fr.sender_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [currentUserId]
    );

    res.json({
      incoming: incomingResult.rows,
      outgoing: outgoingResult.rows
    });
  } catch (error) {
    console.error('Fetch friend requests error:', error);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// Send a friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    if (!targetUsername || !targetUsername.trim()) {
      return res.status(400).json({ error: 'Please enter a username, email or mobile number.' });
    }

    const cleanTarget = targetUsername.trim().replace(/^@/, '');
    const phoneTarget = cleanTarget.replace(/[\s-+()]/g, '');

    const userResult = await db.query(
      `SELECT id, username, email, phone FROM users 
       WHERE LOWER(username) = LOWER($1) 
          OR (email IS NOT NULL AND LOWER(email) = LOWER($1))
          OR (phone IS NOT NULL AND phone = $2)`,
      [cleanTarget, phoneTarget]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: `User "${cleanTarget}" not found.` });
    }

    const targetUser = userResult.rows[0];
    if (targetUser.id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
    }

    const existing = await db.query(
      `SELECT * FROM friend_requests 
       WHERE (sender_id = $1 AND receiver_id = $2) 
          OR (sender_id = $2 AND receiver_id = $1)`,
      [req.user.userId, targetUser.id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'accepted') {
        return res.status(400).json({ error: `You and @${targetUser.username} are already friends!` });
      }
      if (row.sender_id === req.user.userId && row.status === 'pending') {
        return res.status(400).json({ error: `Friend request to @${targetUser.username} is already pending.` });
      }
      if (row.receiver_id === req.user.userId && row.status === 'pending') {
        await db.query(
          `UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [row.id]
        );
        notifyFriendUpdate(req.user.userId, targetUser.id);
        return res.json({ 
          message: `Mutual request! You and @${targetUser.username} are now friends!`,
          status: 'accepted'
        });
      }
    }

    await db.query(
      `INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES ($1, $2, 'pending')`,
      [req.user.userId, targetUser.id]
    );

    const recipientSockets = connectedUsers.get(String(targetUser.id));
    if (recipientSockets) {
      for (const sockId of recipientSockets) {
        io.to(sockId).emit('friend_request_received', {
          senderId: req.user.userId,
          senderUsername: req.user.username
        });
      }
    }

    res.json({ 
      message: `Friend request sent to @${targetUser.username}!`,
      status: 'pending'
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept a friend request
app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    const reqResult = await db.query(
      `SELECT * FROM friend_requests WHERE id = $1 AND receiver_id = $2`,
      [requestId, req.user.userId]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found or unauthorized' });
    }

    const fr = reqResult.rows[0];
    await db.query(
      `UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [requestId]
    );

    notifyFriendUpdate(req.user.userId, fr.sender_id);
    res.json({ message: 'Friend request accepted!' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Reject or cancel a friend request
app.post('/api/friends/reject', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    await db.query(
      `DELETE FROM friend_requests WHERE id = $1 AND (receiver_id = $2 OR sender_id = $2)`,
      [requestId, req.user.userId]
    );

    res.json({ message: 'Friend request removed.' });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Failed to remove friend request' });
  }
});

app.post('/api/users/update-key', authenticateToken, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ error: 'Missing public key' });
    }
    await db.query('UPDATE users SET public_key = $1 WHERE id = $2', [publicKey, req.user.userId]);
    res.json({ message: 'Public key updated successfully' });
  } catch (error) {
    console.error('Update public key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Gemini Proxy Route
app.post('/api/gemini/generate', authenticateToken, async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Server Gemini API key is not configured. Please enter your free API key in ProChat Settings (⚙️).' });
    }
    const { prompt, contents, model = 'gemini-2.5-flash' } = req.body;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    let payloadContents = contents || [{ parts: [{ text: prompt }] }];
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: payloadContents })
    });
    
    if (!fetchRes.ok) {
      const errTxt = await fetchRes.text();
      return res.status(fetchRes.status).json({ error: errTxt });
    }
    const data = await fetchRes.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    res.json({ text });
  } catch (error) {
    console.error('Gemini proxy error:', error);
    res.status(500).json({ error: 'Failed to communicate with Gemini API' });
  }
});

// Socket.io Real-time Logic
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  });
});

io.on('connection', async (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);
  
  const userKey = String(socket.userId);
  if (!connectedUsers.has(userKey)) {
    connectedUsers.set(userKey, new Set());
  }
  connectedUsers.get(userKey).add(socket.id);

  // Broadcast to all other clients that this user is now online
  socket.broadcast.emit('user_status_change', {
    userId: socket.userId,
    username: socket.username,
    isOnline: true
  });

  try {
    const offlineResult = await db.query(
      `SELECT m.id, m.encrypted_payload, m.timestamp, u.username as sender_username
       FROM offline_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.recipient_id = $1`,
      [socket.userId]
    );
    
    if (offlineResult.rows.length > 0) {
      socket.emit('offline_messages', offlineResult.rows);
      await db.query('DELETE FROM offline_messages WHERE recipient_id = $1', [socket.userId]);
    }
  } catch (error) {
    console.error('Error fetching offline messages:', error);
  }

  socket.on('typing_start', async ({ recipientUsername }) => {
    try {
      if (!recipientUsername) return;
      const recipientResult = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [recipientUsername.trim()]);
      if (recipientResult.rows.length > 0) {
        const recipientSockets = connectedUsers.get(String(recipientResult.rows[0].id));
        if (recipientSockets) {
          for (const socketId of recipientSockets) {
            io.to(socketId).emit('user_typing', { username: socket.username, isTyping: true });
          }
        }
      }
    } catch (e) {}
  });

  socket.on('typing_stop', async ({ recipientUsername }) => {
    try {
      if (!recipientUsername) return;
      const recipientResult = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [recipientUsername.trim()]);
      if (recipientResult.rows.length > 0) {
        const recipientSockets = connectedUsers.get(String(recipientResult.rows[0].id));
        if (recipientSockets) {
          for (const socketId of recipientSockets) {
            io.to(socketId).emit('user_typing', { username: socket.username, isTyping: false });
          }
        }
      }
    } catch (e) {}
  });

  socket.on('private_message', async ({ recipientUsername, encryptedPayload }) => {
    try {
      if (!recipientUsername || !encryptedPayload) {
        return socket.emit('chat_error', { message: 'Message payload is missing' });
      }
      const recipientResult = await db.query('SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)', [recipientUsername.trim()]);
      if (recipientResult.rows.length === 0) {
        return socket.emit('chat_error', { message: `User "${recipientUsername}" was not found.` });
      }
      const recipient = recipientResult.rows[0];
      const recipientSockets = connectedUsers.get(String(recipient.id));
      
      if (recipientSockets && recipientSockets.size > 0) {
        for (const socketId of recipientSockets) {
          io.to(socketId).emit('receive_message', {
            senderUsername: socket.username,
            encryptedPayload,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        const payloadStr = typeof encryptedPayload === 'object' ? JSON.stringify(encryptedPayload) : encryptedPayload;
        await db.query(
          'INSERT INTO offline_messages (recipient_id, sender_id, encrypted_payload) VALUES ($1, $2, $3)',
          [recipient.id, socket.userId, payloadStr]
        );
      }
    } catch (error) {
      console.error('Error routing message:', error);
      socket.emit('chat_error', { message: 'Failed to deliver message' });
    }
  });

  socket.on('delete_message', async ({ recipientUsername, messageId, deleteForEveryone }) => {
    try {
      if (!recipientUsername || !messageId) return;
      const recipientResult = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [recipientUsername.trim()]);
      if (recipientResult.rows.length > 0) {
        const recipientSockets = connectedUsers.get(String(recipientResult.rows[0].id));
        if (recipientSockets) {
          for (const socketId of recipientSockets) {
            io.to(socketId).emit('message_deleted', {
              senderUsername: socket.username,
              messageId,
              deleteForEveryone: !!deleteForEveryone
            });
          }
        }
      }
    } catch (e) {
      console.error('Error in delete_message event:', e);
    }
  });

  socket.on('disappearing_setting', async ({ recipientUsername, durationSeconds }) => {
    try {
      if (!recipientUsername) return;
      const recipientResult = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [recipientUsername.trim()]);
      if (recipientResult.rows.length > 0) {
        const recipientSockets = connectedUsers.get(String(recipientResult.rows[0].id));
        if (recipientSockets) {
          for (const socketId of recipientSockets) {
            io.to(socketId).emit('disappearing_setting_updated', {
              senderUsername: socket.username,
              durationSeconds
            });
          }
        }
      }
    } catch (e) {
      console.error('Error in disappearing_setting event:', e);
    }
  });

  socket.on('view_once_opened', async ({ recipientUsername, messageId }) => {
    try {
      if (!recipientUsername || !messageId) return;
      const recipientResult = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [recipientUsername.trim()]);
      if (recipientResult.rows.length > 0) {
        const recipientSockets = connectedUsers.get(String(recipientResult.rows[0].id));
        if (recipientSockets) {
          for (const socketId of recipientSockets) {
            io.to(socketId).emit('view_once_expired', {
              senderUsername: socket.username,
              messageId
            });
          }
        }
      }
    } catch (e) {}
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username}`);
    const userKey = String(socket.userId);
    const sockets = connectedUsers.get(userKey);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        connectedUsers.delete(userKey);
        // Broadcast to all clients that this user is offline
        io.emit('user_status_change', {
          userId: socket.userId,
          username: socket.username,
          isOnline: false
        });
      }
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const os = require('os');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`\n==================================================`);
  console.log(`🚀 ProChat Live Server is RUNNING!`);
  console.log(`💻 Local URL:   http://localhost:${PORT}`);
  console.log(`📱 Network URL: http://${localIp}:${PORT}`);
  console.log(`==================================================\n`);

  // 24/7 Cloud Keep-Alive: Automatically pings /api/health every 10 mins to prevent free-tier sleep
  const cloudUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL || process.env.KOYEB_PUBLIC_URL || 'https://prochat-te69.onrender.com';
  if (cloudUrl) {
    console.log(`[Keep-Alive 24/7] Active for: ${cloudUrl}`);
    setInterval(async () => {
      try {
        const pingTarget = `${cloudUrl.replace(/\/+$/, '')}/api/health`;
        const res = await fetch(pingTarget);
        if (res.ok) {
          console.log(`[Keep-Alive 24/7] Self-ping OK at ${new Date().toLocaleTimeString()}`);
        }
      } catch (err) {
        console.warn(`[Keep-Alive 24/7] Ping note:`, err.message);
      }
    }, 10 * 60 * 1000);
  }
});

