import React, { useState } from 'react';
import { X, Key, Bot, Palette, ShieldCheck, Download, Upload, Check } from 'lucide-react';
import { getGeminiApiKey, setGeminiApiKey, getGeminiModel, setGeminiModel } from '../gemini';

export default function SettingsModal({ isOpen, onClose, currentTheme, onSelectTheme, onRegenerateKeys, username }) {
  if (!isOpen) return null;

  const [apiKeyInput, setApiKeyInput] = useState(() => getGeminiApiKey());
  const [selectedModel, setSelectedModel] = useState(() => getGeminiModel());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveGemini = (e) => {
    e.preventDefault();
    setGeminiApiKey(apiKeyInput);
    setGeminiModel(selectedModel);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleExportPrivateKey = () => {
    try {
      const keyStr = localStorage.getItem(`privateKey_${username}`);
      if (!keyStr) {
        alert("No private key found in storage.");
        return;
      }
      const blob = new Blob([keyStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prochat_key_${username}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export key.");
    }
  };

  const themes = [
    { id: 'deep-space', name: 'Deep Space (Default)', color: '#8b5cf6' },
    { id: 'cyberpunk', name: 'Cyberpunk Neon', color: '#ff4785' },
    { id: 'emerald-matrix', name: 'Emerald Matrix', color: '#10b981' },
    { id: 'frost-silver', name: 'Frost Silver', color: '#3b82f6' }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <Bot className="title-icon" size={22} />
            <h2>ProChat Preferences & Gemini API</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-sections">
          {/* Gemini AI Settings */}
          <div className="settings-card">
            <h3><Bot size={18} /> Google Gemini Free API Settings</h3>
            <p className="card-hint">
              Connect ProChat to Gemini Free API. Get a free API key at <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a>.
            </p>

            <form onSubmit={handleSaveGemini} className="gemini-form">
              <div className="form-group">
                <label>Gemini API Key</label>
                <div className="input-with-icon">
                  <Key size={16} className="input-icon" />
                  <input
                    type="password"
                    placeholder="AIzaSy... (Paste Google Gemini API Key)"
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Gemini AI Model</label>
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Fast & Free)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Standard Free)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro (Advanced Reasoning)</option>
                </select>
              </div>

              <button type="submit" className="save-btn">
                {savedSuccess ? <><Check size={16} /> Saved Successfully!</> : 'Save Gemini Credentials'}
              </button>
            </form>
          </div>

          {/* Themes */}
          <div className="settings-card">
            <h3><Palette size={18} /> Appearance & Themes</h3>
            <div className="theme-grid">
              {themes.map(t => (
                <div
                  key={t.id}
                  className={`theme-option ${currentTheme === t.id ? 'selected' : ''}`}
                  onClick={() => onSelectTheme(t.id)}
                >
                  <span className="theme-dot" style={{ backgroundColor: t.color }}></span>
                  <span className="theme-name">{t.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* E2EE Key Management */}
          <div className="settings-card">
            <h3><ShieldCheck size={18} /> Security & E2EE Keys</h3>
            <p className="card-hint">Manage your 4096-bit WebCrypto keypair used for end-to-end message decryption.</p>
            <div className="key-actions">
              <button className="sec-btn" onClick={handleExportPrivateKey}>
                <Download size={16} /> Export Private Key Backup
              </button>
              <button className="sec-btn danger" onClick={onRegenerateKeys}>
                <Key size={16} /> Regenerate Key Pair
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
