import React, { useState } from 'react';
import { X, Send, Image, Video, Sparkles } from 'lucide-react';

export default function MediaSendModal({ isOpen, fileData, fileType, fileName, onClose, onSendMedia }) {
  if (!isOpen || !fileData) return null;

  const [caption, setCaption] = useState('');
  const [isViewOnce, setIsViewOnce] = useState(false);
  const isVideo = fileType.startsWith('video');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSendMedia({
      mediaUrl: fileData,
      mediaType: isVideo ? 'video' : 'image',
      fileName,
      caption: caption.trim(),
      isViewOnce
    });
    setCaption('');
    setIsViewOnce(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel media-send-modal" onClick={e => e.stopPropagation()}>
        <div className="media-modal-header">
          <div className="media-title">
            {isVideo ? <Video size={20} className="text-purple" /> : <Image size={20} className="text-purple" />}
            <span>Preview & Send {isVideo ? 'Video' : 'Photo'}</span>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="media-preview-container">
          {isVideo ? (
            <video src={fileData} controls className="media-preview-video" autoPlay muted playsInline />
          ) : (
            <img src={fileData} alt="Preview" className="media-preview-img" />
          )}
        </div>

        <form onSubmit={handleSubmit} className="media-send-form">
          <div className="media-caption-row">
            <input
              type="text"
              placeholder="Add a caption (optional)..."
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="media-caption-input"
              autoFocus
            />

            <button
              type="button"
              className={`view-once-pill ${isViewOnce ? 'active' : ''}`}
              onClick={() => setIsViewOnce(!isViewOnce)}
              title={isViewOnce ? "View Once Active: Disappears after opening" : "Make View Once (Can be opened only once)"}
            >
              <span className="once-circle">①</span>
              <span className="once-label">{isViewOnce ? 'Once ON' : 'Once'}</span>
            </button>
          </div>

          <div className="media-modal-actions">
            <span className="media-hint">
              {isViewOnce ? (
                <span className="view-once-alert">
                  <Sparkles size={14} /> Recipient can view this {isVideo ? 'video' : 'photo'} only <strong>once</strong>.
                </span>
              ) : (
                'Standard encrypted media delivery'
              )}
            </span>
            <div className="actions-right">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary-send">
                <Send size={16} /> Send {isViewOnce ? 'Once' : ''}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
