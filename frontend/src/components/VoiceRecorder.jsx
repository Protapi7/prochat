import React, { useState, useRef } from 'react';
import { Mic, Square, Trash2, Send } from 'lucide-react';

export default function VoiceRecorder({ onSendVoiceNote, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const [isViewOnce, setIsViewOnce] = useState(false);

  const handleSend = () => {
    if (!audioBlob) return;
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = () => {
      const base64Audio = reader.result;
      onSendVoiceNote(`[Voice Note](${base64Audio})`, { isViewOnce });
    };
  };

  const formatSecs = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="voice-recorder-bar">
      {!isRecording && !audioBlob && (
        <button className="start-rec-btn" onClick={startRecording}>
          <Mic size={18} /> Record Voice Message
        </button>
      )}

      {isRecording && (
        <div className="recording-status">
          <span className="rec-dot"></span>
          <span className="rec-timer">Recording: {formatSecs(recordingTime)}</span>
          <button className="stop-rec-btn" onClick={stopRecording} title="Stop recording">
            <Square size={16} /> Stop
          </button>
        </div>
      )}

      {audioBlob && !isRecording && (
        <div className="audio-preview">
          <audio src={URL.createObjectURL(audioBlob)} controls className="preview-audio-player" />
          <div className="preview-actions">
            <button 
              type="button"
              className={`view-once-toggle-btn ${isViewOnce ? 'active' : ''}`}
              onClick={() => setIsViewOnce(!isViewOnce)}
              title={isViewOnce ? "View Once Active: Disappears after playing" : "Tap to make View Once (Plays only once)"}
            >
              <span className="once-circle">①</span>
              <span className="once-label">{isViewOnce ? 'Once ON' : 'Once'}</span>
            </button>
            <button className="icon-btn cancel" onClick={() => setAudioBlob(null)} title="Discard">
              <Trash2 size={16} />
            </button>
            <button className="icon-btn send" onClick={handleSend} title={isViewOnce ? "Send View-Once Voice Note" : "Send Voice Note"}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
