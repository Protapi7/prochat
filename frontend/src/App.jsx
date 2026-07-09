import React, { useState, useEffect, useRef } from 'react';
import { socket, connectSocket, disconnectSocket } from './socket';
import { 
  generateKeyPair, exportPublicKey, exportPrivateKey, 
  importPrivateKey, importPublicKey, generateSessionKey, 
  encryptMessage, encryptSessionKey, decryptSessionKey, decryptMessage 
} from './crypto';
import { 
  MessageSquare, Send, LogOut, Search, Lock, Unlock, User, RefreshCw, AlertTriangle 
} from 'lucide-react';
import './index.css';

function getStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

function App() {
  const [token, setToken] = useState(() => getStorage('token'));
  const [username, setUsername] = useState(() => getStorage('username'));
  const [privateKeyJwk, setPrivateKeyJwk] = useState(null);
  
  const [authMode, setAuthMode] = useState('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const [activeChat, setActiveChat] = useState('');
  const [chats, setChats] = useState({}); // { [username]: [{ sender, text, timestamp }] }
  const [unreadCounts, setUnreadCounts] = useState({}); // { [username]: count }
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMessage, setInputMessage] = useState('');

  const activeChatRef = useRef(activeChat);
  const privateKeyJwkRef = useRef(privateKeyJwk);
  const usernameRef = useRef(username);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    privateKeyJwkRef.current = privateKeyJwk;
  }, [privateKeyJwk]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  // Load private key and chat history for the current user
  useEffect(() => {
    if (username) {
      const storedChats = getStorage(`chats_${username}`);
      setChats(storedChats ? JSON.parse(storedChats) : {});
      const storedKey = getStorage(`privateKey_${username}`);
      setPrivateKeyJwk(storedKey || null);
    } else {
      setChats({});
      setPrivateKeyJwk(null);
    }
  }, [username]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chats, activeChat]);

  const handleReceiveMessage = async (data) => {
    try {
      const { senderUsername, encryptedPayload } = data;
      const keyToUse = privateKeyJwkRef.current || getStorage(`privateKey_${usernameRef.current}`);
      if (!keyToUse) {
        console.warn("No private key available to decrypt message");
        return;
      }
      const privateKey = await importPrivateKey(keyToUse);
      
      const payloadObj = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
      const sessionKey = await decryptSessionKey(privateKey, payloadObj.encryptedSessionKey);
      const decryptedText = await decryptMessage(sessionKey, payloadObj.iv, payloadObj.ciphertext);
      
      const timestamp = data.timestamp || new Date().toISOString();
      
      setChats(prev => {
        const userMsgs = prev[senderUsername] || [];
        const newMsgs = [...userMsgs, { sender: senderUsername, text: decryptedText, timestamp }];
        const newChats = {
          ...prev,
          [senderUsername]: newMsgs
        };
        localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(newChats));
        return newChats;
      });

      if (activeChatRef.current !== senderUsername) {
        setUnreadCounts(prev => ({
          ...prev,
          [senderUsername]: (prev[senderUsername] || 0) + 1
        }));
      }
    } catch (e) {
      console.error("Failed to decrypt message", e);
    }
  };

  const handleOfflineMessages = async (msgs) => {
    for (const msg of msgs) {
      const payload = JSON.parse(msg.encrypted_payload);
      await handleReceiveMessage({ 
        senderUsername: msg.sender_username, 
        encryptedPayload: payload,
        timestamp: msg.timestamp 
      });
    }
  };

  const handleUserStatusChange = (data) => {
    setUsers(prevUsers => {
      const exists = prevUsers.some(u => u.username === data.username);
      if (!exists) {
        return [...prevUsers, { id: data.userId, username: data.username, isOnline: data.isOnline }];
      }
      return prevUsers.map(u => {
        if (u.username === data.username) {
          return { ...u, isOnline: data.isOnline };
        }
        return u;
      });
    });
  };

  useEffect(() => {
    if (token) {
      const fetchUsers = async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUsers(data);
          }
        } catch (e) {
          console.error("Error fetching users directory", e);
        }
      };

      fetchUsers();
      connectSocket(token);
      
      socket.on('receive_message', handleReceiveMessage);
      socket.on('offline_messages', handleOfflineMessages);
      socket.on('user_status_change', handleUserStatusChange);
      
      return () => {
        socket.off('receive_message');
        socket.off('offline_messages');
        socket.off('user_status_change');
        disconnectSocket();
      };
    }
  }, [token]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'register') {
        const keyPair = await generateKeyPair();
        const pubKeyStr = await exportPublicKey(keyPair.publicKey);
        const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
        
        const res = await fetch(`${BACKEND_URL}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authUsername, password: authPassword, publicKey: pubKeyStr })
        });
        
        if (res.ok) {
          const data = await res.json();
          try {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', authUsername);
            localStorage.setItem(`privateKey_${authUsername}`, privKeyJwk);
          } catch(e) {}
          setToken(data.token);
          setUsername(authUsername);
        } else {
          alert('Registration failed. Username might exist.');
        }
      } else {
        const res = await fetch(`${BACKEND_URL}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authUsername, password: authPassword })
        });
        
        if (res.ok) {
          const data = await res.json();
          try {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', authUsername);
          } catch(e) {}
          setToken(data.token);
          setUsername(authUsername);
        } else {
          alert('Login failed. Invalid credentials.');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegenerateKeys = async () => {
    try {
      const keyPair = await generateKeyPair();
      const pubKeyStr = await exportPublicKey(keyPair.publicKey);
      const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
      
      const res = await fetch(`${BACKEND_URL}/api/users/update-key`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ publicKey: pubKeyStr })
      });
      
      if (res.ok) {
        localStorage.setItem(`privateKey_${username}`, privKeyJwk);
        setPrivateKeyJwk(privKeyJwk);
        alert('Key pair successfully regenerated and updated on server!');
      } else {
        alert('Failed to update keys on server.');
      }
    } catch (e) {
      console.error(e);
      alert('Error regenerating keys.');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!activeChat || !inputMessage.trim()) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/users/${activeChat}/key`);
      if (!res.ok) {
        alert("User not found or no public key");
        return;
      }
      const { publicKey } = await res.json();
      const recipientPubKey = await importPublicKey(publicKey);

      const sessionKey = await generateSessionKey();
      const encryptedMessageData = await encryptMessage(sessionKey, inputMessage);
      const encryptedSessionKeyArray = await encryptSessionKey(recipientPubKey, sessionKey);

      const encryptedPayload = {
        encryptedSessionKey: encryptedSessionKeyArray,
        iv: encryptedMessageData.iv,
        ciphertext: encryptedMessageData.ciphertext
      };

      socket.emit('private_message', {
        recipientUsername: activeChat,
        encryptedPayload: JSON.stringify(encryptedPayload)
      });

      const timestamp = new Date().toISOString();
      setChats(prev => {
        const userMsgs = prev[activeChat] || [];
        const newMsgs = [...userMsgs, { sender: username, text: inputMessage, timestamp }];
        const newChats = {
          ...prev,
          [activeChat]: newMsgs
        };
        localStorage.setItem(`chats_${username}`, JSON.stringify(newChats));
        return newChats;
      });
      setInputMessage('');
    } catch (err) {
      console.error("Error sending message", err);
    }
  };

  const selectChat = (chatUser) => {
    setActiveChat(chatUser);
    setUnreadCounts(prev => ({
      ...prev,
      [chatUser]: 0
    }));
  };

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getChatPreview = (user) => {
    const chatHistory = chats[user.username];
    if (chatHistory && chatHistory.length > 0) {
      const lastMsg = chatHistory[chatHistory.length - 1];
      return lastMsg.sender === username ? `You: ${lastMsg.text}` : lastMsg.text;
    }
    return 'Click to secure chat';
  };

  if (!token) {
    return (
      <div className="app-container">
        <div className="glass-panel auth-container">
          <div className="auth-header">
            <div className="logo-glow">
              <Lock size={36} />
            </div>
            <h1>Pro Chat E2EE</h1>
            <p>End-to-End Encrypted Private Messaging</p>
          </div>
          <form className="input-group" onSubmit={handleAuth}>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input 
                type="text" 
                placeholder="Username" 
                value={authUsername} 
                onChange={e => setAuthUsername(e.target.value)} 
                required 
              />
            </div>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input 
                type="password" 
                placeholder="Password" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                required 
              />
            </div>
            <button type="submit">{authMode === 'login' ? 'Login' : 'Register & Generate Keys'}</button>
          </form>
          <p style={{textAlign: 'center', cursor: 'pointer', fontSize: '0.9rem', opacity: 0.8}} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? "Need an account? Register" : "Have an account? Login"}
          </p>
        </div>
      </div>
    );
  }

  const activeUser = users.find(u => u.username === activeChat);
  const currentChatMessages = chats[activeChat] || [];

  return (
    <div className="app-container">
      <div className="chat-layout">
        <div className="glass-panel sidebar">
          <div className="sidebar-header">
            <div className="user-profile">
              <div className="avatar-placeholder">
                {username.substring(0, 2).toUpperCase()}
              </div>
              <div className="profile-details">
                <span className="profile-name">{username}</span>
                <span className="profile-status">Online</span>
              </div>
            </div>
            <button className="logout-btn" title="Logout" onClick={() => {
              try {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
              } catch(e) {}
              setToken(null);
              setUsername(null);
              setActiveChat('');
              setChats({});
              setUnreadCounts({});
              disconnectSocket();
            }}>
              <LogOut size={18} />
            </button>
          </div>

          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search secure contacts..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="user-list">
            {filteredUsers.length === 0 ? (
              <p className="no-users">No contacts found</p>
            ) : (
              filteredUsers.map(u => (
                <div 
                  key={u.id || u.username} 
                  className={`user-item ${activeChat === u.username ? 'active' : ''}`}
                  onClick={() => selectChat(u.username)}
                >
                  <div className="avatar-container">
                    <div className="avatar-placeholder">
                      {u.username.substring(0, 2).toUpperCase()}
                    </div>
                    <span className={`status-dot ${u.isOnline ? 'online' : 'offline'}`}></span>
                  </div>
                  <div className="user-item-info">
                    <div className="user-item-header">
                      <span className="username-text">{u.username}</span>
                    </div>
                    <span className="chat-preview">{getChatPreview(u)}</span>
                  </div>
                  {unreadCounts[u.username] > 0 && (
                    <div className="unread-badge">
                      {unreadCounts[u.username]}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="glass-panel chat-area">
          {activeChat ? (
            <>
              <div className="chat-header">
                <div className="chat-header-info">
                  <div className="avatar-placeholder">
                    {activeChat.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="header-text">
                    <h3>{activeChat}</h3>
                    <span className="header-status">
                      {activeUser?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                <div className="security-tag" title="End-to-End Encrypted via RSA-OAEP / AES-GCM">
                  <Lock size={14} style={{ marginRight: '4px' }} />
                  <span>E2EE Secure</span>
                </div>
              </div>

              {!privateKeyJwk && (
                <div className="warning-banner">
                  <AlertTriangle size={18} className="warning-icon" />
                  <div className="warning-content">
                    <p><strong>Private Key Missing:</strong> You cannot decrypt new messages on this device.</p>
                    <button className="regenerate-btn" onClick={handleRegenerateKeys}>
                      <RefreshCw size={14} style={{ marginRight: '6px' }} />
                      Regenerate Keys & Sync
                    </button>
                  </div>
                </div>
              )}
              
              <div className="messages">
                {currentChatMessages.length === 0 ? (
                  <div className="empty-chat-placeholder">
                    <Lock size={32} />
                    <p>Messages are end-to-end encrypted. No one else can read them, not even the server.</p>
                  </div>
                ) : (
                  currentChatMessages.map((m, i) => (
                    <div key={i} className={`message-bubble ${m.sender === username ? 'sent' : 'received'}`}>
                      <div className="message-text">{m.text}</div>
                      <div className="message-time">{formatTime(m.timestamp)}</div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="chat-input" onSubmit={sendMessage}>
                <input 
                  type="text" 
                  placeholder={privateKeyJwk ? "Type an encrypted message..." : "Generate key pair to start chatting"} 
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  disabled={!privateKeyJwk}
                />
                <button type="submit" disabled={!privateKeyJwk || !inputMessage.trim()}>
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="welcome-chat-area">
              <div className="welcome-lock-glow">
                <Lock size={64} />
              </div>
              <h2>Pro Chat E2EE</h2>
              <p>Select a contact from the sidebar to start a secure, end-to-end encrypted conversation.</p>
              <div className="security-badges">
                <span className="badge"><Unlock size={14} /> RSA-2048</span>
                <span className="badge"><Unlock size={14} /> AES-GCM-256</span>
                <span className="badge"><Unlock size={14} /> SQLite / PG</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
