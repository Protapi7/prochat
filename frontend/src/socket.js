import { io } from 'socket.io-client';

export const getServerUrl = () => {
  try {
    const saved = localStorage.getItem('prochat_server_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch (e) {}

  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }

  return window.location.origin;
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
