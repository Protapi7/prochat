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
  Mail, Phone, AlertCircle, ArrowLeft, Clock, Paperclip, Image as ImageIcon, Video, Trash2, Eye, EyeOff, MoreVertical
} from 'lucide-react';
import { askGemini, getSmartReplies, summarizeChat, translateText, polishText } from './gemini';
import ExtensionModal from './components/ExtensionModal';
import SettingsModal from './components/SettingsModal';
import ServerConnectModal from './components/ServerConnectModal';
import VoiceRecorder from './components/VoiceRecorder';
import MediaSendModal from './components/MediaSendModal';
import ViewOnceModal from './components/ViewOnceModal';
import DisappearingSettingsModal from './components/DisappearingSettingsModal';
import DeleteMessageModal from './components/DeleteMessageModal';
import { compressImage, readFileAsDataURL, formatDuration } from './utils/media';
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

  // Mobile View & Ephemeral States
  const [mobileView, setMobileView] = useState('contacts'); // 'contacts' | 'chat'
  const [isOnceTextMode, setIsOnceTextMode] = useState(false);
  const [disappearingSettings, setDisappearingSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('disappearing_settings');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });
  const [isDisappearingModalOpen, setIsDisappearingModalOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [activeViewOnceMsg, setActiveViewOnceMsg] = useState(null);
  const [deleteTargetMsg, setDeleteTargetMsg] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const fileInputRef = useRef(null);

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
      if (!data) return;
      const { senderUsername, encryptedPayload } = data;
      if (!senderUsername || !encryptedPayload) return;

      const currentUserName = usernameRef.current || getStorage('username');
      const keyToUse = privateKeyJwkRef.current || (currentUserName ? getStorage(`privateKey_${currentUserName}`) : null);
      if (!keyToUse) {
        console.warn("No private key available to decrypt message");
        return;
      }
      
      let decryptedText;
      try {
        const privateKey = await importPrivateKey(keyToUse);
        const payloadObj = typeof encryptedPayload === 'string' ? JSON.parse(encryptedPayload) : encryptedPayload;
        const sessionKey = await decryptSessionKey(privateKey, payloadObj.encryptedSessionKey);
        decryptedText = await decryptMessage(sessionKey, payloadObj.iv, payloadObj.ciphertext);
      } catch (decryptErr) {
        console.warn("Failed to decrypt message:", decryptErr);
        decryptedText = "🔒 [Encrypted message - could not decrypt. The encryption key on this device may be out of sync. Use ⚙️ Settings > Regenerate Keys]";
      }
      
      const timestamp = data.timestamp || new Date().toISOString();

      let msgItem = null;
      try {
        const parsed = JSON.parse(decryptedText);
        if (parsed && typeof parsed === 'object' && parsed.id) {
          msgItem = {
            ...parsed,
            sender: senderUsername,
            timestamp: parsed.timestamp || timestamp
          };
        }
      } catch (e) {}

      if (!msgItem) {
        const isVoice = typeof decryptedText === 'string' && decryptedText.startsWith('[Voice Note](');
        msgItem = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          sender: senderUsername,
          text: decryptedText,
          type: isVoice ? 'voice' : 'text',
          mediaUrl: isVoice ? decryptedText.substring(13, decryptedText.length - 1) : null,
          isViewOnce: false,
          timestamp
        };
      }

      // If this message has a disappearing TTL and recipient doesn't have expiresAt set yet
      if (msgItem.disappearingTtl && !msgItem.expiresAt) {
        msgItem.expiresAt = Date.now() + (msgItem.disappearingTtl * 1000);
      }
      
      setChats(prev => {
        const userMsgs = prev[senderUsername] || [];
        const newMsgs = [...userMsgs, msgItem];
        const newChats = {
          ...prev,
          [senderUsername]: newMsgs
        };
        if (currentUserName) {
          localStorage.setItem(`chats_${currentUserName}`, JSON.stringify(newChats));
        }
        return newChats;
      });

      if (activeChatRef.current !== senderUsername) {
        setUnreadCounts(prev => ({
          ...prev,
          [senderUsername]: (prev[senderUsername] || 0) + 1
        }));
      }
    } catch (e) {
      console.error("Failed to handle received message", e);
    }
  };

  const handleOfflineMessages = async (msgs) => {
    if (!Array.isArray(msgs)) return;
    for (const msg of msgs) {
      try {
        const payload = typeof msg.encrypted_payload === 'string' ? JSON.parse(msg.encrypted_payload) : msg.encrypted_payload;
        await handleReceiveMessage({ 
          senderUsername: msg.sender_username, 
          encryptedPayload: payload,
          timestamp: msg.timestamp 
        });
      } catch (e) {}
    }
  };

  const handleUserStatusChange = (data) => {
    if (!data || !data.username) return;
    setUsers(prevUsers => {
      const exists = prevUsers.some(u => u.username === data.username);
      if (!exists) {
        return [...prevUsers, { id: data.userId, username: data.username, isOnline: !!data.isOnline }];
      }
      return prevUsers.map(u => {
        if (u.username === data.username) {
          return { ...u, isOnline: !!data.isOnline };
        }
        return u;
      });
    });
  };

  const handleUserTyping = (data) => {
    if (!data || !data.username) return;
    setTypingUsers(prev => ({
      ...prev,
      [data.username]: !!data.isTyping
    }));
  };

  // Disappearing messages auto-expiry interval
  useEffect(() => {
    const purgeInterval = setInterval(() => {
      const now = Date.now();
      setChats(prev => {
        let changed = false;
        const updated = { ...prev };
        for (const user in updated) {
          const original = updated[user] || [];
          const filtered = original.filter(m => !m.expiresAt || m.expiresAt > now);
          if (filtered.length !== original.length) {
            updated[user] = filtered;
            changed = true;
          }
        }
        if (changed && usernameRef.current) {
          localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(purgeInterval);
  }, []);

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
      
      const onStatusChange = (data) => {
        handleUserStatusChange(data);
        fetchUsers();
      };

      const onChatError = (errData) => {
        console.warn("Server chat error:", errData);
        if (errData && errData.message) {
          alert(`Chat Notice: ${errData.message}`);
        }
      };

      const onMessageDeleted = (delData) => {
        if (!delData || !delData.messageId) return;
        setChats(prev => {
          const sender = delData.senderUsername;
          const userMsgs = prev[sender] || [];
          const updatedMsgs = userMsgs.map(m => {
            if (m.id === delData.messageId) {
              return { ...m, isDeleted: true, text: '🚫 This message was deleted', mediaUrl: null };
            }
            return m;
          });
          const newChats = { ...prev, [sender]: updatedMsgs };
          if (usernameRef.current) localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(newChats));
          return newChats;
        });
      };

      const onDisappearingUpdated = (dispData) => {
        if (!dispData || !dispData.senderUsername) return;
        setDisappearingSettings(prev => {
          const updated = { ...prev, [dispData.senderUsername]: dispData.durationSeconds };
          try { localStorage.setItem('disappearing_settings', JSON.stringify(updated)); } catch (e) {}
          return updated;
        });
        const notice = dispData.durationSeconds > 0 
          ? `⏱️ ${dispData.senderUsername} set disappearing messages to ${formatDuration(dispData.durationSeconds)}` 
          : `⏱️ ${dispData.senderUsername} turned off disappearing messages`;
        setChats(prev => {
          const userMsgs = prev[dispData.senderUsername] || [];
          const newChats = {
            ...prev,
            [dispData.senderUsername]: [...userMsgs, { id: 'sys_' + Date.now(), sender: 'system', text: notice, timestamp: new Date().toISOString() }]
          };
          if (usernameRef.current) localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(newChats));
          return newChats;
        });
      };

      const onViewOnceExpired = (expData) => {
        if (!expData || !expData.messageId) return;
        setChats(prev => {
          const recipient = expData.senderUsername;
          const userMsgs = prev[recipient] || [];
          const updatedMsgs = userMsgs.map(m => {
            if (m.id === expData.messageId) {
              return { ...m, viewOnceState: 'expired', text: '① Opened', mediaUrl: null };
            }
            return m;
          });
          const newChats = { ...prev, [recipient]: updatedMsgs };
          if (usernameRef.current) localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(newChats));
          return newChats;
        });
      };

      socket.on('receive_message', handleReceiveMessage);
      socket.on('offline_messages', handleOfflineMessages);
      socket.on('user_status_change', onStatusChange);
      socket.on('user_typing', handleUserTyping);
      socket.on('chat_error', onChatError);
      socket.on('message_deleted', onMessageDeleted);
      socket.on('disappearing_setting_updated', onDisappearingUpdated);
      socket.on('view_once_expired', onViewOnceExpired);
      
      return () => {
        socket.off('receive_message', handleReceiveMessage);
        socket.off('offline_messages', handleOfflineMessages);
        socket.off('user_status_change', onStatusChange);
        socket.off('user_typing', handleUserTyping);
        socket.off('chat_error', onChatError);
        socket.off('message_deleted', onMessageDeleted);
        socket.off('disappearing_setting_updated', onDisappearingUpdated);
        socket.off('view_once_expired', onViewOnceExpired);
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
          setPrivateKeyJwk(privKeyJwk);
          privateKeyJwkRef.current = privKeyJwk;
          setToken(data.token);
          setUsername(data.username);
          usernameRef.current = data.username;
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
          let privKeyJwk = null;
          try {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            if (data.email) localStorage.setItem('email', data.email);
            if (data.phone) localStorage.setItem('phone', data.phone);

            // Auto sync E2EE key for existing database user login on new browser/device
            privKeyJwk = localStorage.getItem(`privateKey_${data.username}`);
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
          if (privKeyJwk) {
            setPrivateKeyJwk(privKeyJwk);
            privateKeyJwkRef.current = privKeyJwk;
          }
          setToken(data.token);
          setUsername(data.username);
          usernameRef.current = data.username;
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
      const activeTtl = disappearingSettings[activeChat] || 0;
      const expiresAt = activeTtl > 0 ? Date.now() + (activeTtl * 1000) : null;
      const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      let msgPayloadObj = null;
      if (typeof msgPayload === 'object' && msgPayload !== null) {
        msgPayloadObj = {
          id: messageId,
          sender: username,
          text: msgPayload.text || '',
          type: msgPayload.type || 'text',
          mediaUrl: msgPayload.mediaUrl || null,
          caption: msgPayload.caption || null,
          isViewOnce: !!(msgPayload.isViewOnce || options.isViewOnce),
          viewOnceState: 'unopened',
          expiresAt,
          disappearingTtl: activeTtl > 0 ? activeTtl : null,
          timestamp: new Date().toISOString()
        };
      } else {
        const isVoice = typeof textToSend === 'string' && textToSend.startsWith('[Voice Note](');
        const isViewOnce = !!(options.isViewOnce || isOnceTextMode);
        msgPayloadObj = {
          id: messageId,
          sender: username,
          text: isVoice ? '[Voice Note]' : textToSend,
          type: isVoice ? 'voice' : 'text',
          mediaUrl: isVoice ? textToSend.substring(13, textToSend.length - 1) : null,
          caption: null,
          isViewOnce,
          viewOnceState: 'unopened',
          expiresAt,
          disappearingTtl: activeTtl > 0 ? activeTtl : null,
          timestamp: new Date().toISOString()
        };
      }

      const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(activeChat)}/key`));
      if (!res.ok) {
        alert(`Cannot send message: User "${activeChat}" not found or missing public encryption key.`);
        return;
      }
      const data = await res.json();
      if (!data || !data.publicKey) {
        alert(`User "${activeChat}" does not have an active public encryption key.`);
        return;
      }
      const recipientPubKey = await importPublicKey(data.publicKey);

      const sessionKey = await generateSessionKey();
      const stringifiedPayload = JSON.stringify(msgPayloadObj);
      const encryptedMessageData = await encryptMessage(sessionKey, stringifiedPayload);
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

      setChats(prev => {
        const userMsgs = prev[activeChat] || [];
        const newMsgs = [...userMsgs, msgPayloadObj];
        const newChats = {
          ...prev,
          [activeChat]: newMsgs
        };
        localStorage.setItem(`chats_${username}`, JSON.stringify(newChats));
        return newChats;
      });
      setInputMessage('');
      setIsOnceTextMode(false);
    } catch (err) {
      console.error("Error sending message", err);
      alert("Failed to send message: " + (err.message || 'Encryption error'));
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

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.type.startsWith('image/')) {
        const compressedDataUrl = await compressImage(file, 1280, 0.75);
        setPendingMedia({
          dataUrl: compressedDataUrl,
          type: file.type,
          name: file.name
        });
      } else if (file.type.startsWith('video/')) {
        if (file.size > 20 * 1024 * 1024) {
          alert("Video size must be under 20MB for fast encrypted delivery.");
          return;
        }
        const videoDataUrl = await readFileAsDataURL(file);
        setPendingMedia({
          dataUrl: videoDataUrl,
          type: file.type,
          name: file.name
        });
      } else {
        alert("Please select an image or video file.");
      }
    } catch (err) {
      console.error("Error processing media file:", err);
      alert("Failed to load media: " + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendMedia = ({ mediaUrl, mediaType, caption, isViewOnce }) => {
    handleSendMessage({
      type: mediaType,
      mediaUrl,
      caption,
      text: caption || (isViewOnce ? `① View Once ${mediaType}` : `[${mediaType === 'video' ? 'Video' : 'Photo'}]`),
      isViewOnce
    });
    setPendingMedia(null);
  };

  const handleViewOnceOpen = (msg) => {
    if (msg.viewOnceState === 'expired') return;
    setActiveViewOnceMsg(msg);
  };

  const handleViewOnceExpire = (messageId) => {
    if (!activeChat || !messageId) return;
    socket.emit('view_once_opened', { recipientUsername: activeChat, messageId });
    setChats(prev => {
      const msgs = (prev[activeChat] || []).map(m => {
        if (m.id === messageId) {
          return { ...m, viewOnceState: 'expired', text: '① Opened • Expired', mediaUrl: null };
        }
        return m;
      });
      const updated = { ...prev, [activeChat]: msgs };
      if (usernameRef.current) localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(updated));
      return updated;
    });
    setActiveViewOnceMsg(null);
  };

  const executeDeleteMessage = (msg, deleteForEveryone = false) => {
    if (!activeChat || !msg) return;
    if (deleteForEveryone && msg.sender === username) {
      socket.emit('delete_message', {
        recipientUsername: activeChat,
        messageId: msg.id,
        deleteForEveryone: true
      });
      setChats(prev => {
        const msgs = (prev[activeChat] || []).map(m => m.id === msg.id ? { ...m, isDeleted: true, text: '🚫 This message was deleted', mediaUrl: null } : m);
        const updated = { ...prev, [activeChat]: msgs };
        localStorage.setItem(`chats_${username}`, JSON.stringify(updated));
        return updated;
      });
    } else {
      setChats(prev => {
        const msgs = (prev[activeChat] || []).filter(m => m.id !== msg.id);
        const updated = { ...prev, [activeChat]: msgs };
        localStorage.setItem(`chats_${username}`, JSON.stringify(updated));
        return updated;
      });
    }
    setDeleteTargetMsg(null);
  };

  const updateDisappearingDuration = (seconds) => {
    if (!activeChat) return;
    const updated = { ...disappearingSettings, [activeChat]: seconds };
    setDisappearingSettings(updated);
    try { localStorage.setItem('disappearing_settings', JSON.stringify(updated)); } catch (e) {}
    socket.emit('disappearing_setting', { recipientUsername: activeChat, durationSeconds: seconds });
    const noticeText = seconds > 0 
      ? `⏱️ You set disappearing messages to ${formatDuration(seconds)}` 
      : `⏱️ You turned off disappearing messages`;
    setChats(prev => {
      const userMsgs = prev[activeChat] || [];
      const newChats = {
        ...prev,
        [activeChat]: [...userMsgs, { id: 'sys_' + Date.now(), sender: 'system', text: noticeText, timestamp: new Date().toISOString() }]
      };
      if (usernameRef.current) localStorage.setItem(`chats_${usernameRef.current}`, JSON.stringify(newChats));
      return newChats;
    });
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
    setMobileView('chat');
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
            <p style={{fontSize: '0.78rem', color: '#94a3b8', margin: '8px 0 0 0', textAlign: 'center'}}>
              💡 Testing 2 accounts on the same computer? Open the second account in an <strong>Incognito / Private</strong> window.
            </p>
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
      <div className={`chat-layout ${mobileView === 'contacts' ? 'mobile-contacts' : 'mobile-chat'}`}>
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
                  {/* Mobile Back Button to return to contacts list */}
                  <button 
                    type="button" 
                    className="mobile-back-btn" 
                    onClick={() => setMobileView('contacts')}
                    title="Back to contacts"
                  >
                    <ArrowLeft size={22} />
                  </button>

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

                {/* AI Toolbar & Security Badges & Disappearing Messages Setting */}
                <div className="header-tools">
                  {!activeUser?.isAi && (
                    <button 
                      type="button" 
                      className={`tool-btn disappearing-btn ${disappearingSettings[activeChat] ? 'active-timer' : ''}`}
                      onClick={() => setIsDisappearingModalOpen(true)}
                      title="Disappearing Messages Timer"
                    >
                      <Clock size={15} />
                      <span>{disappearingSettings[activeChat] ? formatDuration(disappearingSettings[activeChat]) : 'Timer'}</span>
                    </button>
                  )}

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
                    // System notice message (e.g. disappearing timer changed)
                    if (m.sender === 'system') {
                      return (
                        <div key={m.id || i} className="system-notice-bubble">
                          {m.text}
                        </div>
                      );
                    }

                    // Deleted message
                    if (m.isDeleted) {
                      return (
                        <div key={m.id || i} className={`message-bubble ${m.sender === username ? 'sent' : 'received'} deleted`}>
                          <div className="message-text">🚫 This message was deleted</div>
                          <div className="message-time">{formatTime(m.timestamp)}</div>
                        </div>
                      );
                    }

                    // View Once Ephemeral Message (Photo, Video, Voice, Text)
                    if (m.isViewOnce) {
                      const isExpired = m.viewOnceState === 'expired';
                      const isSender = m.sender === username;

                      return (
                        <div key={m.id || i} className={`message-bubble ${isSender ? 'sent' : 'received'}`}>
                          <div className="message-bubble-header">
                            <span className="message-sender-name">{m.sender}</span>
                            <button 
                              type="button" 
                              className="message-options-btn" 
                              onClick={() => setDeleteTargetMsg(m)}
                              title="Delete message"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {isExpired ? (
                            <div className="view-once-card expired">
                              <div className="view-once-icon-box"><span className="once-circle">①</span></div>
                              <div className="view-once-info">
                                <span className="view-once-title">
                                  {m.type === 'video' ? 'Video' : m.type === 'image' ? 'Photo' : m.type === 'voice' ? 'Voice note' : 'Message'} opened
                                </span>
                                <span className="view-once-sub">Expired</span>
                              </div>
                            </div>
                          ) : isSender ? (
                            <div className="view-once-card sender-view">
                              <div className="view-once-icon-box"><span className="once-circle">①</span></div>
                              <div className="view-once-info">
                                <span className="view-once-title">
                                  View Once {m.type === 'video' ? 'Video' : m.type === 'image' ? 'Photo' : m.type === 'voice' ? 'Voice note' : 'Text'}
                                </span>
                                <span className="view-once-sub">
                                  {m.caption || (m.type === 'text' ? m.text : 'Sent (Unopened)')}
                                </span>
                              </div>
                            </div>
                          ) : m.type === 'voice' ? (
                            <div className="view-once-card unopened" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <div className="view-once-icon-box"><span className="once-circle">①</span></div>
                                <div className="view-once-info">
                                  <span className="view-once-title">View-Once Voice Note</span>
                                  <span className="view-once-sub">Plays only once</span>
                                </div>
                              </div>
                              {m.mediaUrl && (
                                <audio 
                                  src={m.mediaUrl} 
                                  controls 
                                  className="message-audio-player" 
                                  onEnded={() => handleViewOnceExpire(m.id)}
                                />
                              )}
                            </div>
                          ) : (
                            <div className="view-once-card unopened" onClick={() => handleViewOnceOpen(m)}>
                              <div className="view-once-icon-box"><span className="once-circle">①</span></div>
                              <div className="view-once-info">
                                <span className="view-once-title">
                                  View Once {m.type === 'video' ? 'Video' : m.type === 'image' ? 'Photo' : 'Text'}
                                </span>
                                <span className="view-once-sub">Tap to view</span>
                              </div>
                            </div>
                          )}

                          <div className="message-time">
                            {formatTime(m.timestamp)}
                            {m.expiresAt && <span className="disappearing-badge"><Clock size={11} /></span>}
                          </div>
                        </div>
                      );
                    }

                    // Standard messages (Photo, Video, Voice note, or Text)
                    const isVoiceNote = m.type === 'voice' || (typeof m.text === 'string' && m.text.startsWith('[Voice Note]('));
                    const audioSrc = m.mediaUrl || (isVoiceNote && typeof m.text === 'string' && m.text.startsWith('[Voice Note](') ? m.text.substring(13, m.text.length - 1) : null);

                    return (
                      <div key={m.id || i} className={`message-bubble ${m.sender === username ? 'sent' : 'received'} ${m.sender === GEMINI_BOT_NAME ? 'ai-bubble' : ''}`}>
                        <div className="message-bubble-header">
                          <span className="message-sender-name">{m.sender}</span>
                          {m.sender !== GEMINI_BOT_NAME && (
                            <button 
                              type="button" 
                              className="message-options-btn" 
                              onClick={() => setDeleteTargetMsg(m)}
                              title="Delete message"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {/* Photo Attachment */}
                        {m.type === 'image' && m.mediaUrl && (
                          <div className="chat-media-wrapper">
                            <img 
                              src={m.mediaUrl} 
                              alt="Photo" 
                              className="chat-media-img" 
                              onClick={() => setFullscreenImage(m.mediaUrl)} 
                            />
                            {m.caption && <p className="media-caption-text">{m.caption}</p>}
                          </div>
                        )}

                        {/* Video Attachment */}
                        {m.type === 'video' && m.mediaUrl && (
                          <div className="chat-media-wrapper">
                            <video src={m.mediaUrl} controls playsInline className="chat-media-video" />
                            {m.caption && <p className="media-caption-text">{m.caption}</p>}
                          </div>
                        )}

                        {/* Audio Voice Note */}
                        {isVoiceNote && audioSrc && (
                          <audio src={audioSrc} controls className="message-audio-player" />
                        )}

                        {/* Plain Text Content */}
                        {!m.mediaUrl && m.type !== 'image' && m.type !== 'video' && !isVoiceNote && (
                          <div className="message-text">{m.text}</div>
                        )}

                        <div className="message-time">
                          {formatTime(m.timestamp)}
                          {m.expiresAt && <span className="disappearing-badge"><Clock size={11} /></span>}
                        </div>
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
                  onSendVoiceNote={(voiceText, opts) => {
                    handleSendMessage(voiceText, opts);
                    setShowVoiceRecorder(false);
                  }}
                  onCancel={() => setShowVoiceRecorder(false)}
                />
              )}

              {/* Chat Input Bar */}
              <form className="chat-input" onSubmit={onSubmitForm}>
                {/* Media Attachment (Photo & Video) */}
                <button 
                  type="button" 
                  className="attach-btn" 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Attach Photo or Video"
                >
                  <Paperclip size={18} />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*,video/*" 
                  onChange={handleFileSelect} 
                  style={{ display: 'none' }} 
                />

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
                      : isOnceTextMode 
                        ? "Type a View-Once encrypted text message..."
                        : "Type an encrypted message (or /gemini prompt)..."
                  } 
                  value={inputMessage}
                  onChange={handleInputChange}
                  disabled={!privateKeyJwk && !activeUser?.isAi}
                />

                {/* View-Once Text Toggle Button before sending */}
                {!activeUser?.isAi && (
                  <button
                    type="button"
                    className={`view-once-text-toggle ${isOnceTextMode ? 'active' : ''}`}
                    onClick={() => setIsOnceTextMode(!isOnceTextMode)}
                    title={isOnceTextMode ? "View Once Active: Receiver can view only once" : "Send as View Once (Direct send vs Once option)"}
                  >
                    <span className="once-badge">①</span>
                  </button>
                )}

                <button 
                  type="submit" 
                  disabled={(!privateKeyJwk && !activeUser?.isAi) || !inputMessage.trim()}
                  title={isOnceTextMode ? "Send View-Once Message" : "Direct Send"}
                >
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

      {/* Media Send & Preview Modal (Photo / Video with View Once option) */}
      <MediaSendModal 
        isOpen={!!pendingMedia}
        fileData={pendingMedia?.dataUrl}
        fileType={pendingMedia?.type || ''}
        fileName={pendingMedia?.name || ''}
        onClose={() => setPendingMedia(null)}
        onSendMedia={handleSendMedia}
      />

      {/* View Once Ephemeral Viewer Modal */}
      <ViewOnceModal 
        isOpen={!!activeViewOnceMsg}
        message={activeViewOnceMsg}
        onClose={() => setActiveViewOnceMsg(null)}
        onExpire={handleViewOnceExpire}
      />

      {/* Disappearing Messages Settings Modal */}
      <DisappearingSettingsModal 
        isOpen={isDisappearingModalOpen}
        onClose={() => setIsDisappearingModalOpen(false)}
        currentSeconds={disappearingSettings[activeChat] || 0}
        onSelectDuration={updateDisappearingDuration}
        contactName={activeChat}
      />

      {/* Delete Message Confirmation Modal */}
      <DeleteMessageModal 
        isOpen={!!deleteTargetMsg}
        message={deleteTargetMsg}
        isSender={deleteTargetMsg?.sender === username}
        onClose={() => setDeleteTargetMsg(null)}
        onDeleteForMe={(msg) => executeDeleteMessage(msg, false)}
        onDeleteForEveryone={(msg) => executeDeleteMessage(msg, true)}
      />

      {/* Fullscreen Regular Image Viewer Modal */}
      {fullscreenImage && (
        <div className="modal-overlay" onClick={() => setFullscreenImage(null)}>
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <img src={fullscreenImage} alt="Fullscreen" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px' }} />
            <button 
              type="button" 
              onClick={() => setFullscreenImage(null)}
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
