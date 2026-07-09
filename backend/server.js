require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { initDb } = require('./db');

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

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, publicKey } = req.body;
    if (!username || !password || !publicKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      'INSERT INTO users (username, password_hash, public_key) VALUES ($1, $2, $3) RETURNING id',
      [username, passwordHash, publicKey]
    );

    const userId = result.rows[0].id;
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({ 
      message: 'User registered successfully', 
      userId,
      token 
    });
  } catch (error) {
    if (error.code === '23505') { // Postgres unique violation code
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      message: 'Login successful', 
      userId: user.id,
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
    const result = await db.query('SELECT public_key FROM users WHERE username = $1', [req.params.username]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ publicKey: result.rows[0].public_key });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT id, username, public_key FROM users');
    const usersList = result.rows
      .filter(u => u.username !== req.user.username)
      .map(u => ({
        id: u.id,
        username: u.username,
        publicKey: u.public_key,
        isOnline: connectedUsers.has(u.id) && connectedUsers.get(u.id).size > 0
      }));
    res.json(usersList);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Internal server error' });
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


// Socket.io Real-time Logic
const connectedUsers = new Map(); // userId -> Set of socketIds

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
  
  if (!connectedUsers.has(socket.userId)) {
    connectedUsers.set(socket.userId, new Set());
  }
  connectedUsers.get(socket.userId).add(socket.id);

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

  socket.on('private_message', async ({ recipientUsername, encryptedPayload }) => {
    try {
      const recipientResult = await db.query('SELECT id FROM users WHERE username = $1', [recipientUsername]);
      if (recipientResult.rows.length === 0) {
        return socket.emit('error', 'Recipient not found');
      }
      const recipient = recipientResult.rows[0];
      const recipientSockets = connectedUsers.get(recipient.id);
      
      if (recipientSockets && recipientSockets.size > 0) {
        for (const socketId of recipientSockets) {
          io.to(socketId).emit('receive_message', {
            senderUsername: socket.username,
            encryptedPayload,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        await db.query(
          'INSERT INTO offline_messages (recipient_id, sender_id, encrypted_payload) VALUES ($1, $2, $3)',
          [recipient.id, socket.userId, encryptedPayload]
        );
      }
    } catch (error) {
      console.error('Error routing message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username}`);
    const sockets = connectedUsers.get(socket.userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        connectedUsers.delete(socket.userId);
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

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
