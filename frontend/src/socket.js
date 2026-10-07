import { io } from 'socket.io-client';

export const DEFAULT_CLOUD_BACKEND = 'https://prochat-te69.onrender.com';

export const getServerUrl = () => {
  try {
    const saved = localStorage.getItem('prochat_server_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch (e) {}

  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    // GitHub Pages is static-only: automatically connect to 24/7 cloud server
    if (hostname.endsWith('github.io')) {
      return DEFAULT_CLOUD_BACKEND;
    }
    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://${hostname}:3001`;
    }
    // Local Network IP (e.g. Android phone or friend on same Wi-Fi)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return `http://${hostname}:3001`;
    }
  }

  if (import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.trim()) {
    return import.meta.env.VITE_BACKEND_URL.trim().replace(/\/+$/, '');
  }

  return typeof window !== 'undefined' && window.location ? window.location.origin : DEFAULT_CLOUD_BACKEND;
};

export const setServerUrl = (newUrl) => {
  try {
    if (!newUrl || !newUrl.trim()) {
      localStorage.removeItem('prochat_server_url');
    } else {
      let formatted = newUrl.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(formatted)) {
        formatted = 'http://' + formatted;
      }
      localStorage.setItem('prochat_server_url', formatted);
    }
  } catch (e) {}
};

const currentServerUrl = getServerUrl();

export const socket = io(currentServerUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

export const connectSocket = (token) => {
  const activeUrl = getServerUrl();
  if (socket.io.uri !== activeUrl) {
    socket.io.uri = activeUrl;
  }
  socket.auth = { token };
  socket.connect();
};

export const disconnectSocket = () => {
  socket.disconnect();
};

export const reconnectWithServerUrl = (newUrl, token) => {
  setServerUrl(newUrl);
  const activeUrl = getServerUrl();
  socket.disconnect();
  socket.io.uri = activeUrl;
  if (token) {
    socket.auth = { token };
    socket.connect();
  }
};
