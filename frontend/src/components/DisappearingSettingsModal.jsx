import React from 'react';
import { X, Clock, Check, Shield } from 'lucide-react';

const OPTIONS = [
  { label: 'Off', seconds: 0, desc: 'Messages stay until manually deleted' },
  { label: '30 Seconds', seconds: 30, desc: 'Ultra-fast privacy testing & ephemeral notes' },
  { label: '5 Minutes', seconds: 300, desc: 'Ideal for brief confidential conversations' },
  { label: '1 Hour', seconds: 3600, desc: 'Clean chat history after one hour' },
  { label: '24 Hours', seconds: 86400, desc: 'Standard 1-day disappearing chat history' },
];

export default function DisappearingSettingsModal({ isOpen, onClose, currentSeconds, onSelectDuration, contactName }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel disappearing-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <Clock size={20} className="text-purple" />
            <h3>Disappearing Messages</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <p className="disappearing-desc">
          When turned on, new messages sent in this chat with <strong>{contactName}</strong> will automatically disappear and be permanently deleted after the chosen duration.
        </p>

        <div className="disappearing-options-list">
          {OPTIONS.map(opt => {
            const isSelected = (currentSeconds || 0) === opt.seconds;
            return (
              <div 
                key={opt.seconds} 
                className={`disappearing-opt-card ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  onSelectDuration(opt.seconds);
                  onClose();
                }}
              >
                <div className="opt-left">
                  <span className="opt-label">{opt.label}</span>
                  <span className="opt-sub">{opt.desc}</span>
                </div>
                <div className="opt-radio">
                  {isSelected && <Check size={16} className="text-green" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="disappearing-footer-note">
          <Shield size={14} />
          <span>Existing messages sent before changing this setting will not be affected.</span>
        </div>
      </div>
    </div>
  );
}
