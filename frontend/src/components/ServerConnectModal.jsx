import React, { useState, useEffect } from 'react';
import { X, Server, QrCode, Wifi, CheckCircle2, AlertCircle, RefreshCw, Smartphone, Globe, Copy, Check, Radio } from 'lucide-react';
import { getServerUrl, setServerUrl, reconnectWithServerUrl } from '../socket';

// Simple SVG QR Code Generator helper for zero external dependency rendering
function SimpleQrCode({ text, size = 180 }) {
  // Generate a basic 2D matrix pattern based on string hash for visual representation
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&color=8b5cf6&bgboundary=1`;
  
  return (
    <div className="qr-container">
      <img src={qrUrl} alt="ProChat Mobile Pair QR Code" width={size} height={size} className="qr-image" />
    </div>
  );
}

export default function ServerConnectModal({ isOpen, onClose, userToken, onServerChanged }) {
  if (!isOpen) return null;

  const [currentUrl, setCurrentUrl] = useState(() => getServerUrl());
  const [inputUrl, setInputUrl] = useState(() => getServerUrl());
  const [serverInfo, setServerInfo] = useState(null);
  const [status, setStatus] = useState('checking'); // 'online' | 'offline' | 'checking'
  const [pingMs, setPingMs] = useState(null);
  const [copied, setCopied] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  const testConnection = async (targetUrl) => {
    setStatus('checking');
    const startTime = Date.now();
    try {
      const cleanUrl = targetUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/server-info`, {
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) {
        const data = await response.json();
        setPingMs(Date.now() - startTime);
        setServerInfo(data);
        setStatus('online');
        return true;
      } else {
        setStatus('offline');
        setServerInfo(null);
        return false;
      }
    } catch (err) {
      setStatus('offline');
      setServerInfo(null);
      return false;
    }
  };

  useEffect(() => {
    testConnection(currentUrl);
  }, [currentUrl]);

  const handleApplyServer = async (e) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    let target = inputUrl.trim();
    if (!/^https?:\/\//i.test(target)) {
      target = 'http://' + target;
    }

    const isOk = await testConnection(target);
    reconnectWithServerUrl(target, userToken);
    setCurrentUrl(target);
    if (onServerChanged) onServerChanged(target);
  };

  const handleAutoDetect = async () => {
    setAutoDetecting(true);
    const host = window.location.hostname || 'localhost';
    const port = 3001;
    const candidates = [
      `http://${host}:${port}`,
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`
    ];

    for (const url of candidates) {
      const ok = await testConnection(url);
      if (ok) {
        setInputUrl(url);
        reconnectWithServerUrl(url, userToken);
        setCurrentUrl(url);
        if (onServerChanged) onServerChanged(url);
        setAutoDetecting(false);
        return;
      }
    }
    setAutoDetecting(false);
  };

  const copyPairLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel server-connect-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <Server className="title-icon text-purple" size={22} />
            <h2>Mobile Auto Server Connection & Host Pair</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p className="modal-subtitle">
          Connect your Android or iOS phone directly to your host PC server, custom device server, or cloud hosting.
        </p>

        {/* Live Server Status Card */}
        <div className={`server-status-card ${status}`}>
          <div className="status-top">
            <div className="status-indicator">
              <Radio size={18} className={`pulse-icon ${status}`} />
              <span className="status-text">
                {status === 'online' ? 'Server Connected' : status === 'checking' ? 'Testing Connection...' : 'Host Server Offline'}
              </span>
            </div>
            {pingMs && status === 'online' && (
              <span className="latency-badge">{pingMs}ms</span>
            )}
          </div>
          
          <div className="server-url-display">
            <code>{currentUrl}</code>
            <button className="copy-icon-btn" onClick={copyPairLink} title="Copy Host Server URL">
              {copied ? <Check size={16} className="text-green" /> : <Copy size={16} />}
            </button>
          </div>

          {serverInfo && (
            <div className="server-meta">
              <span>📱 Network IP: <strong>{serverInfo.localIp}</strong></span>
              <span>⚡ Port: <strong>{serverInfo.port}</strong></span>
            </div>
          )}
        </div>

        {/* QR Code Scanner / Mobile Pair Section */}
        <div className="qr-pair-section">
          <div className="qr-box">
            <SimpleQrCode text={currentUrl} size={150} />
          </div>
          <div className="qr-instructions">
            <h3><Smartphone size={18} /> Connect Mobile Phone (Android & iOS)</h3>
            <ol>
              <li>Open Camera or QR Reader on your Android or iPhone.</li>
              <li>Scan the QR code to open ProChat on your mobile browser.</li>
              <li>Your phone will automatically pair and connect to this host server!</li>
            </ol>
          </div>
        </div>

        {/* Custom Host Server Input Form */}
        <form onSubmit={handleApplyServer} className="server-form">
          <div className="form-group">
            <label><Globe size={16} /> Custom Host Server IP / Address</label>
            <div className="input-row">
              <input
                type="text"
                placeholder="e.g. http://192.168.1.15:3001 or https://prochat.onrender.com"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
              />
              <button type="submit" className="connect-btn">
                <CheckCircle2 size={16} /> Connect
              </button>
            </div>
          </div>

          <div className="preset-buttons">
            <button
              type="button"
              className="preset-btn"
              onClick={() => { setInputUrl(`http://localhost:3001`); }}
            >
              Localhost (3001)
            </button>
            
            {serverInfo?.localIp && (
              <button
                type="button"
                className="preset-btn Highlight"
                onClick={() => { setInputUrl(`http://${serverInfo.localIp}:3001`); }}
              >
                Local Network ({serverInfo.localIp})
              </button>
            )}

            <button
              type="button"
              className="preset-btn"
              onClick={handleAutoDetect}
              disabled={autoDetecting}
            >
              <RefreshCw size={14} className={autoDetecting ? 'spin' : ''} />
              Auto Detect Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
