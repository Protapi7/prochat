import React, { useEffect, useState } from 'react';
import { X, Lock, Sparkles, Clock, AlertCircle } from 'lucide-react';

export default function ViewOnceModal({ isOpen, message, onClose, onExpire }) {
  if (!isOpen || !message) return null;

  const isVideo = message.type === 'video' || (message.mediaUrl && message.mediaUrl.startsWith('data:video'));
  const isImage = message.type === 'image' || (message.mediaUrl && message.mediaUrl.startsWith('data:image'));
  const isText = message.type === 'text' || !message.mediaUrl;

  const [timeLeft, setTimeLeft] = useState(isText ? 15 : null);

  useEffect(() => {
    let timer;
    if (isText && timeLeft !== null) {
      if (timeLeft <= 0) {
        handleCloseAndExpire();
      } else {
        timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      }
    }
    return () => clearTimeout(timer);
  }, [timeLeft, isText]);

  const handleCloseAndExpire = () => {
    onExpire(message.id);
    onClose();
  };

  return (
    <div className="view-once-modal-overlay">
      <div className="view-once-wrapper">
        <div className="view-once-header">
          <div className="view-once-pill-badge">
            <span className="once-circle">①</span>
            <span>View Once Ephemeral Media</span>
          </div>

          <div className="view-once-header-right">
            {isText && timeLeft !== null && (
              <span className="view-once-countdown">
                <Clock size={14} /> Closing in {timeLeft}s
              </span>
            )}
            <button 
              type="button" 
              className="view-once-close-btn" 
              onClick={handleCloseAndExpire}
              title="Close and permanently expire"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="view-once-content-box">
          {isImage && (
            <img 
              src={message.mediaUrl} 
              alt="Ephemeral View Once" 
              className="view-once-img" 
            />
          )}

          {isVideo && (
            <video 
              src={message.mediaUrl} 
              controls 
              autoPlay 
              playsInline 
              className="view-once-video" 
              onEnded={handleCloseAndExpire}
            />
          )}

          {isText && (
            <div className="view-once-text-card">
              <div className="view-once-watermark">
                <Lock size={32} />
                <p>Confidential View-Once Message</p>
              </div>
              <p className="view-once-text-content">{message.text}</p>
            </div>
          )}

          {message.caption && (
            <div className="view-once-caption-bar">
              <p>{message.caption}</p>
            </div>
          )}
        </div>

        <div className="view-once-footer">
          <AlertCircle size={15} />
          <span>This message will permanently disappear and cannot be re-opened once closed.</span>
          <button type="button" className="done-expire-btn" onClick={handleCloseAndExpire}>
            Done & Destroy
          </button>
        </div>
      </div>
    </div>
  );
}
