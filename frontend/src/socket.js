import { io } from 'socket.io-client';

// Use environment variable, fallback to localhost for development
const URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export const socket = io(URL, {
  autoConnect: false
});

export const connectSocket = (token) => {
  socket.auth = { token };
  socket.connect();
};

export const disconnectSocket = () => {
  socket.disconnect();
};
