import React, { useState, useEffect, useRef } from 'react';
import { socket, connectSocket, disconnectSocket, getServerUrl } from './socket';
import { 
  generateKeyPair, exportPublicKey, exportPrivateKey, 
  importPrivateKey, importPublicKey, generateSessionKey, 
  encryptMessage, encryptSessionKey, decryptSessionKey, decryptMessage 
} from './crypto';
import { 
  MessageSquare, Send, LogOut, Search, Lock, Unlock, User, RefreshCw, AlertTriangle,
  Bot, Sparkles, Settings, Mic, Download, Globe, Wand2, FileText, CheckCircle2, ChevronDown, Server, Smartphone,
  Mail, Phone, AlertCircle
} from 'lucide-react';
import { askGemini, getSmartReplies, summarizeChat, translateText, polishText } from './gemini';
import ExtensionModal from './components/ExtensionModal';
import SettingsModal from './components/SettingsModal';
import ServerConnectModal from './components/ServerConnectModal';
import VoiceRecorder from './components/VoiceRecorder';
import './index.css';

function getStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

const getApiUrl = (endpoint) => `${getServerUrl()}${endpoint}`;

const GEMINI_BOT_NAME = 'Gemini AI';

function App() {
  const [token, setToken] = useState(() => getStorage('token'));
  const [username, setUsername] = useState(() => getStorage('username'));
  const [userEmail, setUserEmail] = useState(() => getStorage('email'));
  const [userPhone, setUserPhone] = useState(() => getStorage('phone'));
  const [privateKeyJwk, setPrivateKeyJwk] = useState(null);
  
  const [authMode, setAuthMode] = useState('login');
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [serverHealth, setServerHealth] = useState('checking'); // 'online' | 'offline' | 'checking'
  const [activeServerHost, setActiveServerHost] = useState(() => getServerUrl());

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(getApiUrl('/api/health'), { signal: AbortSignal.timeout(3000) });
        if (res.ok && isMounted) {
          setServerHealth('online');
        } else if (isMounted) {
          setServerHealth('offline');
        }
      } catch (e) {
        if (isMounted) setServerHealth('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [activeServerHost]);

  const [activeChat, setActiveChat] = useState('');
  const [chats, setChats] = useState({}); // { [username]: [{ sender, text, timestamp }] }
  const [unreadCounts, setUnreadCounts] = useState({}); // { [username]: count }
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMessage, setInputMessage] = useState('');

  // Live Extensions State
  const [extensions, setExtensions] = useState({
    gemini: true,
    e2ee: true,
    voicenotes: true,
    themes: true,
    browser_ext: true
  });
  
  const [currentTheme, setCurrentTheme] = useState(() => getStorage('theme') || 'deep-space');
  const [isExtModalOpen, setIsExtModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  
  // Real-time AI & Typing States
  const [typingUsers, setTypingUsers] = useState({}); // { [username]: boolean }
  const [smartReplies, setSmartReplies] = useState([]);
  const [isGeminiThinking, setIsGeminiThinking] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [targetLang, setTargetLang] = useState('English');

  const activeChatRef = useRef(activeChat);
  const privateKeyJwkRef = useRef(privateKeyJwk);
  const usernameRef = useRef(username);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    try { localStorage.setItem('theme', currentTheme); } catch (e) {}
  }, [currentTheme]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    privateKeyJwkRef.current = privateKeyJwk;
  }, [privateKeyJwk]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  // Load private key and chat history for current user
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
  }, [chats, activeChat, isGeminiThinking]);

  // Fetch Smart Replies whenever active chat or messages change
  useEffect(() => {
    if (extensions.gemini && activeChat && chats[activeChat] && chats[activeChat].length > 0) {
      const msgs = chats[activeChat];
      getSmartReplies(msgs).then(replies => {
        setSmartReplies(replies || []);
      }).catch(() => setSmartReplies([]));
    } else {
      setSmartReplies([]);
    }
  }, [activeChat, chats, extensions.gemini]);

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

  const handleUserTyping = (data) => {
    setTypingUsers(prev => ({
      ...prev,
      [data.username]: data.isTyping
    }));
  };

  useEffect(() => {
    if (token) {
      const fetchUsers = async () => {
        try {
          const res = await fetch(getApiUrl('/api/users'), {
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
      socket.on('user_status_change', () => {
        handleUserStatusChange();
        fetchUsers();
      });
      socket.on('user_typing', handleUserTyping);
      
      return () => {
        socket.off('receive_message');
        socket.off('offline_messages');
        socket.off('user_status_change');
        socket.off('user_typing');
        disconnectSocket();
      };
    }
  }, [token]);

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);

    if (activeChat && activeChat !== GEMINI_BOT_NAME) {
      socket.emit('typing_start', { recipientUsername: activeChat });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { recipientUsername: activeChat });
      }, 2000);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'register') {
        if (!authUsername.trim()) {
          setAuthError('Please enter a username');
          return;
        }
        if (!authEmail.trim() && !authPhone.trim()) {
          setAuthError('Please enter either your Email ID or Mobile Number');
          return;
        }
        if (!authPassword) {
          setAuthError('Please enter a password');
          return;
        }

        const keyPair = await generateKeyPair();
        const pubKeyStr = await exportPublicKey(keyPair.publicKey);
        const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
        
        const res = await fetch(getApiUrl('/api/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            username: authUsername.trim(), 
            email: authEmail.trim() || undefined,
            phone: authPhone.trim() || undefined,
            password: authPassword, 
            publicKey: pubKeyStr 
          })
        });
        
        const data = await res.json();
        if (res.ok) {
          try {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            if (data.email) localStorage.setItem('email', data.email);
            if (data.phone) localStorage.setItem('phone', data.phone);
            localStorage.setItem(`privateKey_${data.username}`, privKeyJwk);
          } catch(e) {}
          setToken(data.token);
          setUsername(data.username);
          if (data.email) setUserEmail(data.email);
          if (data.phone) setUserPhone(data.phone);
        } else {
          setAuthError(data.error || 'Registration failed.');
        }
      } else {
        const queryIdentifier = (authIdentifier || authUsername).trim();
        if (!queryIdentifier || !authPassword) {
          setAuthError('Please enter your Mobile Number, Email ID or Username, and Password.');
          return;
        }

        const res = await fetch(getApiUrl('/api/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: queryIdentifier, password: authPassword })
        });
        
        const data = await res.json();
        if (res.ok) {
          try {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            if (data.email) localStorage.setItem('email', data.email);
            if (data.phone) localStorage.setItem('phone', data.phone);

            // Auto sync E2EE key for existing database user login on new browser/device
            let privKeyJwk = localStorage.getItem(`privateKey_${data.username}`);
            if (!privKeyJwk) {
              const keyPair = await generateKeyPair();
              const pubKeyStr = await exportPublicKey(keyPair.publicKey);
              privKeyJwk = await exportPrivateKey(keyPair.privateKey);
              localStorage.setItem(`privateKey_${data.username}`, privKeyJwk);
              
              await fetch(getApiUrl('/api/users/update-key'), {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${data.token}`
                },
                body: JSON.stringify({ publicKey: pubKeyStr })
              });
            }
          } catch(e) {}
          setToken(data.token);
          setUsername(data.username);
          if (data.email) setUserEmail(data.email);
          if (data.phone) setUserPhone(data.phone);
        } else {
          setAuthError(data.error || 'Login failed. Invalid credentials.');
        }
      }
    } catch (e) {
      console.error(e);
      const host = getServerUrl();
      if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
        setAuthError(`Cannot connect to 24/7 Cloud Host at ${host}. Tap the Server Status pill above to launch or link your free Render cloud backend.`);
      } else {
        setAuthError(`Cannot connect to host server at ${host}. Please ensure backend is running.`);
      }
    }
  };

  const handleRegenerateKeys = async () => {
    try {
      const keyPair = await generateKeyPair();
      const pubKeyStr = await exportPublicKey(keyPair.publicKey);
      const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
      
      const res = await fetch(getApiUrl('/api/users/update-key'), {
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

  const handleSendMessage = async (msgText) => {
    const textToSend = msgText || inputMessage;
    if (!activeChat || !textToSend.trim()) return;

    // Check if message is a /gemini command
    if (textToSend.startsWith('/gemini ')) {
      const prompt = textToSend.replace('/gemini ', '').trim();
      setInputMessage('');
      
      // Save local message
      const userMsg = { sender: username, text: textToSend, timestamp: new Date().toISOString() };
      setChats(prev => {
        const newMsgs = [...(prev[activeChat] || []), userMsg];
        const updated = { ...prev, [activeChat]: newMsgs };
        localStorage.setItem(`chats_${username}`, JSON.stringify(updated));
        return updated;
      });

      setIsGeminiThinking(true);
      try {
        const aiResponse = await askGemini(prompt, chats[activeChat] || []);
        const aiMsg = { sender: GEMINI_BOT_NAME, text: `🤖 **Gemini AI Response**:\n${aiResponse}`, timestamp: new Date().toISOString() };
        setChats(prev => {
          const newMsgs = [...(prev[activeChat] || []), aiMsg];
          const updated = { ...prev, [activeChat]: newMsgs };
          localStorage.setItem(`chats_${username}`, JSON.stringify(updated));
          return updated;
        });
      } catch (err) {
        const errMsg = { sender: GEMINI_BOT_NAME, text: `⚠️ Error: ${err.message}`, timestamp: new Date().toISOString() };
        setChats(prev => ({ ...prev, [activeChat]: [...(prev[activeChat] || []), errMsg] }));
      } finally {
        setIsGeminiThinking(false);
      }
      return;
    }

    // 1-on-1 Chat with Gemini AI Bot
    if (activeChat === GEMINI_BOT_NAME) {
      setInputMessage('');
      const userMsg = { sender: username, text: textToSend, timestamp: new Date().toISOString() };
      const currentHistory = chats[GEMINI_BOT_NAME] || [];
      
      setChats(prev => {
        const newMsgs = [...(prev[GEMINI_BOT_NAME] || []), userMsg];
        const updated = { ...prev, [GEMINI_BOT_NAME]: newMsgs };
        localStorage.setItem(`chats_${username}`, JSON.stringify(updated));
        return updated;
      });

      setIsGeminiThinking(true);
      try {
        const reply = await askGemini(textToSend, currentHistory);
        const botMsg = { sender: GEMINI_BOT_NAME, text: reply, timestamp: new Date().toISOString() };
        setChats(prev => {
          const newMsgs = [...(prev[GEMINI_BOT_NAME] || []), botMsg];
          const updated = { ...prev, [GEMINI_BOT_NAME]: newMsgs };
          localStorage.setItem(`chats_${username}`, JSON.stringify(updated));
          return updated;
        });
      } catch (err) {
        const errMsg = { sender: GEMINI_BOT_NAME, text: `⚠️ Error: ${err.message}`, timestamp: new Date().toISOString() };
        setChats(prev => ({ ...prev, [GEMINI_BOT_NAME]: [...(prev[GEMINI_BOT_NAME] || []), errMsg] }));
      } finally {
        setIsGeminiThinking(false);
      }
      return;
    }

    // Standard E2EE 1-on-1 Message to Human User
    try {
      const res = await fetch(getApiUrl(`/api/users/${activeChat}/key`));
      if (!res.ok) {
        alert("User not found or missing public key");
        return;
      }
      const { publicKey } = await res.json();
      const recipientPubKey = await importPublicKey(publicKey);

      const sessionKey = await generateSessionKey();
      const encryptedMessageData = await encryptMessage(sessionKey, textToSend);
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
      socket.emit('typing_stop', { recipientUsername: activeChat });

      const timestamp = new Date().toISOString();
      setChats(prev => {
        const userMsgs = prev[activeChat] || [];
        const newMsgs = [...userMsgs, { sender: username, text: textToSend, timestamp }];
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

  const onSubmitForm = (e) => {
    e.preventDefault();
    handleSendMessage();
  };

  const handlePolishMessage = async (tone) => {
    if (!inputMessage.trim()) return;
    try {
      const revised = await polishText(inputMessage, tone);
      setInputMessage(revised);
    } catch (e) {
      alert("Failed to polish message: " + e.message);
    }
  };

  const handleTranslateChat = async () => {
    if (!activeChat || !chats[activeChat] || chats[activeChat].length === 0) return;
    try {
      const lastMsg = chats[activeChat][chats[activeChat].length - 1];
      const translated = await translateText(lastMsg.text, targetLang);
      alert(`Original: ${lastMsg.text}\n\nTranslated (${targetLang}):\n${translated}`);
    } catch (e) {
      alert("Translation error: " + e.message);
    }
  };

  const handleSummarizeChat = async () => {
    if (!activeChat || !chats[activeChat] || chats[activeChat].length === 0) return;
    setIsGeminiThinking(true);
    try {
      const summary = await summarizeChat(chats[activeChat]);
      setSummaryText(summary);
      setShowSummaryModal(true);
    } catch (e) {
      alert("Summarization error: " + e.message);
    } finally {
      setIsGeminiThinking(false);
    }
  };

  const handleDownloadChromeExtension = () => {
    const readmeContent = `ProChat Chrome Extension Package
===================================
1. Open Chrome browser and navigate to chrome://extensions/
2. Enable "Developer mode" toggle in the top right corner.
3. Click "Load unpacked".
4. Select the 'extension' folder inside the ProChat project codebase!
5. ProChat icon will now appear in your browser toolbar!`;
    const blob = new Blob([readmeContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ProChat_Extension_Instructions.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Combine real users with virtual Gemini AI bot
  const allContacts = extensions.gemini 
    ? [
        { id: 'gemini-ai-bot', username: GEMINI_BOT_NAME, isOnline: true, isAi: true },
        ...users
      ]
    : users;

  const filteredUsers = allContacts.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.phone && u.phone.includes(searchQuery))
  );

  const getChatPreview = (user) => {
    const chatHistory = chats[user.username];
    if (chatHistory && chatHistory.length > 0) {
      const lastMsg = chatHistory[chatHistory.length - 1];
      return lastMsg.sender === username ? `You: ${lastMsg.text}` : lastMsg.text;
    }
    return user.isAi ? 'Ask anything to Gemini AI' : 'Click to secure chat';
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
            <p>End-to-End Encrypted Private Messaging & Gemini AI</p>
          </div>

          <div 
            className={`server-status-pill ${serverHealth}`} 
            onClick={() => setIsServerModalOpen(true)} 
            title="Click to change or connect host server"
          >
            <span className={`status-dot ${serverHealth === 'online' ? 'online' : 'offline'}`}></span>
            <span className="server-status-label">
              {serverHealth === 'online' ? `Host Connected: ${activeServerHost}` : `⚠️ Server Offline / Not Connected (Click to Setup)`}
            </span>
          </div>

          {authError && (
            <div className="auth-error-banner">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <div className="auth-toggle-tabs">
            <button 
              type="button" 
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              Sign In
            </button>
            <button 
              type="button" 
              className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
            >
              New Account
            </button>
          </div>

          <form className="input-group" onSubmit={handleAuth}>
            {authMode === 'login' ? (
              <>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="Mobile Number / Email / Username" 
                    value={authIdentifier} 
                    onChange={e => setAuthIdentifier(e.target.value)} 
                    required 
                    autoComplete="username"
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
                    autoComplete="current-password"
                  />
                </div>
                <button type="submit">Sign In to ProChat</button>
              </>
            ) : (
              <>
                <div className="input-wrapper">
                  <User size={18} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="Username (e.g. alex)" 
                    value={authUsername} 
                    onChange={e => setAuthUsername(e.target.value)} 
                    required 
                  />
                </div>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input 
                    type="email" 
                    placeholder="Email ID (e.g. alex@gmail.com)" 
                    value={authEmail} 
                    onChange={e => setAuthEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div className="input-wrapper">
                  <Phone size={18} className="input-icon" />
                  <input 
                    type="tel" 
                    placeholder="Mobile Number (e.g. +91 9876543210)" 
                    value={authPhone} 
                    onChange={e => setAuthPhone(e.target.value)} 
                    required 
                  />
                </div>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input 
                    type="password" 
                    placeholder="Create Strong Password" 
                    value={authPassword} 
                    onChange={e => setAuthPassword(e.target.value)} 
                    required 
                    autoComplete="new-password"
                  />
                </div>
                <button type="submit">Register & Generate Keys</button>
              </>
            )}
          </form>

          <p style={{textAlign: 'center', cursor: 'pointer', fontSize: '0.9rem', opacity: 0.8, marginTop: '8px'}} 
             onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}>
            {authMode === 'login' ? "Don't have an account? Register with Mobile & Email" : "Already registered? Login with Mobile or Email"}
          </p>

          <div className="auth-footer-help">
            <button type="button" className="server-setup-link" onClick={() => setIsServerModalOpen(true)}>
              <Server size={14} /> Server Connection & Pairing
            </button>
          </div>
        </div>
        <ServerConnectModal 
          isOpen={isServerModalOpen} 
          onClose={() => setIsServerModalOpen(false)} 
          userToken={token} 
          onServerChanged={(newUrl) => {
            setActiveServerHost(newUrl);
            setAuthError('');
          }}
        />
      </div>
    );
  }

  const activeUser = filteredUsers.find(u => u.username === activeChat);
  const currentChatMessages = chats[activeChat] || [];

  return (
    <div className="app-container">
      <div className="chat-layout">
        {/* Sidebar */}
        <div className="glass-panel sidebar">
          <div className="sidebar-header">
            <div className="user-profile">
              <div className="avatar-placeholder">
                {username.substring(0, 2).toUpperCase()}
              </div>
              <div className="profile-details">
                <span className="profile-name">{username}</span>
                <span className="profile-status">{userPhone || userEmail || 'Online'}</span>
              </div>
            </div>

            <div className="header-icon-btns">
              <button 
                className="icon-btn-nav" 
                title="Mobile Auto Server Pair & Host Connection" 
                onClick={() => setIsServerModalOpen(true)}
              >
                <Server size={18} className="text-purple" />
              </button>
              <button 
                className="icon-btn-nav" 
                title="ProChat Extension Marketplace & Mobile Center" 
                onClick={() => setIsExtModalOpen(true)}
              >
                <Sparkles size={18} className="sparkle-gold" />
              </button>
              <button 
                className="icon-btn-nav" 
                title="Preferences & Gemini API" 
                onClick={() => setIsSettingsOpen(true)}
              >
                <Settings size={18} />
              </button>
              <button className="logout-btn" title="Logout" onClick={() => {
                try {
                  localStorage.removeItem('token');
                  localStorage.removeItem('username');
                  localStorage.removeItem('email');
                  localStorage.removeItem('phone');
                } catch(e) {}
                setToken(null);
                setUsername(null);
                setUserEmail(null);
                setUserPhone(null);
                setActiveChat('');
                setChats({});
                setUnreadCounts({});
                disconnectSocket();
              }}>
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search contacts & Gemini..." 
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
                  className={`user-item ${activeChat === u.username ? 'active' : ''} ${u.isAi ? 'ai-item' : ''}`}
                  onClick={() => selectChat(u.username)}
                >
                  <div className="avatar-container">
                    <div className={`avatar-placeholder ${u.isAi ? 'ai-avatar' : ''}`}>
                      {u.isAi ? <Bot size={20} /> : u.username.substring(0, 2).toUpperCase()}
                    </div>
                    <span className={`status-dot ${u.isOnline ? 'online' : 'offline'}`}></span>
                  </div>
                  <div className="user-item-info">
                    <div className="user-item-header">
                      <span className="username-text">{u.username}</span>
                      {u.isAi && <span className="ai-badge">AI</span>}
                    </div>
                    {(u.phone || u.email) && !u.isAi && (
                      <span className="user-subdetail">{u.phone ? `📱 ${u.phone}` : `✉️ ${u.email}`}</span>
                    )}
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
        
        {/* Main Chat Window */}
        <div className="glass-panel chat-area">
          {activeChat ? (
            <>
              <div className="chat-header">
                <div className="chat-header-info">
                  <div className={`avatar-placeholder ${activeUser?.isAi ? 'ai-avatar' : ''}`}>
                    {activeUser?.isAi ? <Bot size={20} /> : activeChat.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="header-text">
                    <h3>{activeChat}</h3>
                    <span className="header-status">
                      {typingUsers[activeChat] ? (
                        <span className="typing-text">typing...</span>
                      ) : activeUser?.isAi ? (
                        'Always Active (Google Gemini Free API)'
                      ) : activeUser?.isOnline ? (
                        'Online'
                      ) : (
                        'Offline'
                      )}
                    </span>
                  </div>
                </div>

                {/* AI Toolbar & Security Badges */}
                <div className="header-tools">
                  {extensions.gemini && currentChatMessages.length > 0 && (
                    <>
                      <button className="tool-btn" title="Summarize 1-on-1 Chat" onClick={handleSummarizeChat}>
                        <FileText size={15} /> Summarize
                      </button>
                      
                      <div className="translate-wrapper">
                        <Globe size={15} className="globe-icon" />
                        <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="lang-select">
                          <option value="English">EN</option>
                          <option value="Spanish">ES</option>
                          <option value="French">FR</option>
                          <option value="German">DE</option>
                          <option value="Hindi">HI</option>
                          <option value="Japanese">JA</option>
                        </select>
                        <button className="translate-go-btn" onClick={handleTranslateChat} title="Translate last message">
                          Go
                        </button>
                      </div>
                    </>
                  )}

                  <div className="security-tag" title="End-to-End Encrypted via RSA-OAEP / AES-GCM">
                    <Lock size={14} style={{ marginRight: '4px' }} />
                    <span>{activeUser?.isAi ? 'AI Encryption' : 'E2EE Secure'}</span>
                  </div>
                </div>
              </div>

              {!privateKeyJwk && !activeUser?.isAi && (
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
              
              {/* Message History */}
              <div className="messages">
                {currentChatMessages.length === 0 ? (
                  <div className="empty-chat-placeholder">
                    {activeUser?.isAi ? <Bot size={48} className="ai-pulse-icon" /> : <Lock size={32} />}
                    <p>
                      {activeUser?.isAi 
                        ? 'Start chatting with Gemini AI! Ask questions, write code, or request ideas.'
                        : 'Messages are end-to-end encrypted. No one else can read them, not even the server.'}
                    </p>
                  </div>
                ) : (
                  currentChatMessages.map((m, i) => {
                    const isVoiceNote = typeof m.text === 'string' && m.text.startsWith('[Voice Note](');
                    const audioSrc = isVoiceNote ? m.text.substring(13, m.text.length - 1) : null;

                    return (
                      <div key={i} className={`message-bubble ${m.sender === username ? 'sent' : 'received'} ${m.sender === GEMINI_BOT_NAME ? 'ai-bubble' : ''}`}>
                        <div className="message-sender-name">{m.sender}</div>
                        <div className="message-text">
                          {isVoiceNote ? (
                            <audio src={audioSrc} controls className="message-audio-player" />
                          ) : (
                            m.text
                          )}
                        </div>
                        <div className="message-time">{formatTime(m.timestamp)}</div>
                      </div>
                    );
                  })
                )}

                {isGeminiThinking && (
                  <div className="message-bubble received ai-bubble thinking">
                    <Bot size={16} className="spinning-ai" /> Gemini AI is thinking...
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* AI Smart Replies Chips */}
              {extensions.gemini && smartReplies.length > 0 && (
                <div className="smart-replies-bar">
                  <span className="smart-title"><Sparkles size={12} /> AI Quick Replies:</span>
                  {smartReplies.map((reply, idx) => (
                    <button 
                      key={idx} 
                      className="smart-reply-chip"
                      onClick={() => handleSendMessage(reply)}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}

              {/* Voice Recorder Bar */}
              {showVoiceRecorder && (
                <VoiceRecorder 
                  onSendVoiceNote={(voiceText) => {
                    handleSendMessage(voiceText);
                    setShowVoiceRecorder(false);
                  }}
                  onCancel={() => setShowVoiceRecorder(false)}
                />
              )}

              {/* Chat Input Bar */}
              <form className="chat-input" onSubmit={onSubmitForm}>
                {extensions.voicenotes && (
                  <button 
                    type="button" 
                    className={`mic-toggle-btn ${showVoiceRecorder ? 'active' : ''}`}
                    onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                    title="Voice Note Recorder"
                  >
                    <Mic size={18} />
                  </button>
                )}

                {extensions.gemini && (
                  <button 
                    type="button" 
                    className="polish-btn"
                    title="Polish / Improve tone with Gemini"
                    onClick={() => handlePolishMessage('professional')}
                  >
                    <Wand2 size={16} />
                  </button>
                )}

                <input 
                  type="text" 
                  placeholder={
                    activeUser?.isAi 
                      ? "Ask Gemini AI anything..." 
                      : "Type an encrypted message (or /gemini prompt)..."
                  } 
                  value={inputMessage}
                  onChange={handleInputChange}
                  disabled={!privateKeyJwk && !activeUser?.isAi}
                />

                <button type="submit" disabled={(!privateKeyJwk && !activeUser?.isAi) || !inputMessage.trim()}>
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="welcome-chat-area">
              <div className="welcome-lock-glow">
                <Lock size={64} />
              </div>
              <h2>Pro Chat E2EE & Gemini AI</h2>
              <p>Select a contact or chat with <strong>🤖 Gemini AI Assistant</strong> for intelligent conversations.</p>
              <div className="security-badges">
                <span className="badge"><Bot size={14} /> Gemini 2.5 Flash</span>
                <span className="badge"><Unlock size={14} /> RSA-2048</span>
                <span className="badge"><Unlock size={14} /> AES-GCM-256</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Extension Hub Modal */}
      <ExtensionModal 
        isOpen={isExtModalOpen}
        onClose={() => setIsExtModalOpen(false)}
        extensions={extensions}
        toggleExtension={(id) => setExtensions(prev => ({ ...prev, [id]: !prev[id] }))}
        onDownloadChromeExtension={handleDownloadChromeExtension}
        onOpenServerModal={() => setIsServerModalOpen(true)}
      />

      {/* Server Auto Connect & QR Pair Modal */}
      <ServerConnectModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        userToken={token}
      />

      {/* Settings & Gemini Key Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={currentTheme}
        onSelectTheme={(t) => setCurrentTheme(t)}
        onRegenerateKeys={handleRegenerateKeys}
        username={username}
      />

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="modal-overlay" onClick={() => setShowSummaryModal(false)}>
          <div className="glass-panel summary-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><FileText size={20} /> AI Conversation Summary</h3>
              <button className="close-btn" onClick={() => setShowSummaryModal(false)}>✕</button>
            </div>
            <div className="summary-body">
              <pre>{summaryText}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
