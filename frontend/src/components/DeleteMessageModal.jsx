import React from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';

export default function DeleteMessageModal({ isOpen, message, isSender, onClose, onDeleteForMe, onDeleteForEveryone }) {
  if (!isOpen || !message) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel delete-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <Trash2 size={20} className="text-red" />
            <h3>Delete Message</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="delete-modal-prompt">
          Choose how you would like to delete this message.
        </p>

        <div className="delete-actions-list">
          {isSender && (
            <button 
              type="button" 
              className="delete-opt-btn danger"
              onClick={() => { onDeleteForEveryone(message); onClose(); }}
            >
              <Trash2 size={16} /> Delete for everyone
            </button>
          )}

          <button 
            type="button" 
            className="delete-opt-btn"
            onClick={() => { onDeleteForMe(message); onClose(); }}
          >
            <Trash2 size={16} /> Delete for me
          </button>

          <button 
            type="button" 
            className="delete-opt-btn cancel"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
