import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.onerror = function(msg, url, lineNo, columnNo, error) {
  document.body.innerHTML = '<div style="color:red; padding:20px; background:white; font-family:sans-serif;"><h3>Application Error</h3><p>' + msg + '</p><pre>' + (error ? error.stack : '') + '</pre></div>';
  return false;
};

// Register PWA Service Worker for Mobile (Android & iOS)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('PWA ServiceWorker registration failed: ', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
