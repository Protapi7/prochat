import React, { useState, useEffect } from 'react';
import { X, Bot, Shield, Mic, Palette, Globe, CheckCircle2, Download, ToggleLeft, ToggleRight, Sparkles, Smartphone, Apple, ExternalLink } from 'lucide-react';

export default function ExtensionModal({ isOpen, onClose, extensions, toggleExtension, onDownloadChromeExtension, onOpenServerModal }) {
  if (!isOpen) return null;

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installedPwa, setInstalledPwa] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) {
      alert("To install ProChat Mobile App:\n\n• iOS (iPhone/iPad): Tap Share button in Safari -> 'Add to Home Screen'\n• Android Chrome/Brave: Tap 3 dots menu -> 'Install App' or 'Add to Home screen'");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalledPwa(true);
    }
    setDeferredPrompt(null);
  };

  const extensionList = [
    {
      id: 'android_app',
      name: 'ProChat Android App & Kiwi Extension',
      version: 'v1.5.0',
      author: 'Android Mobile Team',
      icon: <Smartphone size={24} className="ext-icon-android" />,
      description: 'Install ProChat directly on your Android phone home screen via PWA or install Chrome extension files into Kiwi Browser / Firefox for Android.',
      badge: 'Android Native',
      badgeClass: 'badge-green',
      isMobilePwa: true
    },
    {
      id: 'ios_app',
      name: 'ProChat iOS (iPhone/iPad) Extension & App',
      version: 'v1.5.0',
      author: 'iOS Mobile Team',
      icon: <Apple size={24} className="ext-icon-ios" />,
      description: 'Run ProChat full screen on iPhone/iPad with zero app store restrictions. Tap Safari Share icon -> "Add to Home Screen" to enable native mobile background mode.',
      badge: 'iOS Standalone',
      badgeClass: 'badge-purple',
      isIosGuide: true
    },
    {
      id: 'gemini',
      name: 'Gemini Free AI Assistant & Smart Tools',
      version: 'v2.5.0',
      author: 'Google AI / ProChat Team',
      icon: <Bot size={24} className="ext-icon-ai" />,
      description: 'Adds Gemini 1-on-1 AI Bot, Smart Reply chips, Slash commands (/gemini), Chat Summarizer, and Real-time Translator.',
      badge: 'Recommended',
      badgeClass: 'badge-purple'
    },
    {
      id: 'e2ee',
      name: 'End-to-End Encryption Security Guard',
      version: 'v1.4.0',
      author: 'ProChat Core',
      icon: <Shield size={24} className="ext-icon-security" />,
      description: 'WebCrypto RSA-OAEP + AES-GCM session key verification, security health indicator, key backup & export tool.',
      badge: 'Core Guard',
      badgeClass: 'badge-green'
    },
    {
      id: 'voicenotes',
      name: 'Voice Notes & Media Sharing',
      version: 'v1.2.0',
      author: 'Media Lab',
      icon: <Mic size={24} className="ext-icon-media" />,
      description: 'Enables high-fidelity microphone recording, voice note player, image attachments, and media previews.',
      badge: 'Popular',
      badgeClass: 'badge-pink'
    },
    {
      id: 'themes',
      name: 'Glassmorphic Cyberpunk Theme Pack',
      version: 'v2.0.0',
      author: 'Aesthetics Lab',
      icon: <Palette size={24} className="ext-icon-theme" />,
      description: 'Adds custom dynamic color themes: Deep Space, Cyberpunk Neon, Emerald Matrix, and Frost Silver.',
      badge: 'Visuals',
      badgeClass: 'badge-blue'
    },
    {
      id: 'browser_ext',
      name: 'ProChat PC Chrome & Desktop Extension',
      version: 'v1.0.0',
      author: 'Browser Ops',
      icon: <Globe size={24} className="ext-icon-chrome" />,
      description: 'Install ProChat directly into Google Chrome, Edge, or Brave for quick popup access and unread message notifications.',
      badge: 'Browser Addon',
      badgeClass: 'badge-orange',
      isDownloadable: true
    }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel extension-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <Sparkles className="title-icon text-purple" size={22} />
            <h2>ProChat Extension Marketplace & Mobile Center</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p className="modal-subtitle">
          Install Android & iOS extensions, pair with your host device server, or enable AI helper features.
        </p>

        {/* Mobile Server Connection Fast-Track Banner */}
        <div className="mobile-fasttrack-banner">
          <div className="banner-left">
            <Smartphone size={20} className="text-purple" />
            <div>
              <strong>Auto Server Pairing for Android & iOS</strong>
              <p>Pair your mobile phone to host PC or custom device server automatically via QR code.</p>
            </div>
          </div>
          <button className="open-server-modal-btn" onClick={() => { onClose(); onOpenServerModal(); }}>
            Open Server Pair QR
          </button>
        </div>

        <div className="extension-grid">
          {extensionList.map(ext => {
            const isEnabled = !!extensions[ext.id];

            return (
              <div key={ext.id} className={`extension-card ${isEnabled || ext.isMobilePwa || ext.isIosGuide ? 'enabled' : ''}`}>
                <div className="card-top">
                  <div className="card-icon">{ext.icon}</div>
                  <div className="card-info">
                    <div className="card-title-row">
                      <h3>{ext.name}</h3>
                      <span className={`ext-badge ${ext.badgeClass}`}>{ext.badge}</span>
                    </div>
                    <span className="ext-meta">{ext.version} • {ext.author}</span>
                  </div>
                </div>

                <p className="card-desc">{ext.description}</p>

                <div className="card-actions">
                  {ext.isMobilePwa ? (
                    <button className="download-ext-btn mobile-install-btn" onClick={handleInstallPwa}>
                      <Smartphone size={16} /> {installedPwa ? 'App Installed!' : 'Install Mobile App (PWA)'}
                    </button>
                  ) : ext.isIosGuide ? (
                    <button className="download-ext-btn ios-guide-btn" onClick={() => alert("iOS (iPhone/iPad) Installation Steps:\n\n1. Open ProChat link in Safari\n2. Tap the Share button (bottom bar)\n3. Scroll down and tap 'Add to Home Screen'\n4. Open ProChat from home screen for fullscreen mobile app experience!")}>
                      <Apple size={16} /> How to Install on iPhone/iPad
                    </button>
                  ) : ext.isDownloadable ? (
                    <button className="download-ext-btn" onClick={onDownloadChromeExtension}>
                      <Download size={16} /> Download Chrome Extension (.zip)
                    </button>
                  ) : (
                    <button 
                      className={`toggle-ext-btn ${isEnabled ? 'active' : ''}`}
                      onClick={() => toggleExtension(ext.id)}
                    >
                      {isEnabled ? (
                        <>
                          <ToggleRight size={22} className="toggle-icon active" /> Enabled
                        </>
                      ) : (
                        <>
                          <ToggleLeft size={22} className="toggle-icon" /> Disabled
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
