import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, X, Check, RotateCcw, AlertTriangle, Image as ImageIcon } from 'lucide-react';

export default function CameraModal({ isOpen, onClose, onPhotoTaken }) {
  const [stream, setStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) | 'user' (selfie)
  const [cameraError, setCameraError] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileFallbackRef = useRef(null);

  // Check for camera devices
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        if (videoInputs.length > 1) {
          setHasMultipleCameras(true);
        }
      }).catch(() => {});
    }
  }, []);

  // Start or restart camera stream
  const startCamera = async (mode = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by this browser.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Camera access failed, falling back:', err);
      // Try fallback to any video stream without facingMode constraint
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play().catch(() => {});
        }
      } catch (fallbackErr) {
        setCameraError(err.message || 'Camera permission denied or camera unavailable.');
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (isOpen && !capturedPhoto) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, capturedPhoto]);

  // Capture photo from video stream
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    // If front camera, mirror image for natural selfie feel
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Shutter flash effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const handleFlipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  const handleConfirmPhoto = () => {
    if (!capturedPhoto) return;
    onPhotoTaken(capturedPhoto);
    handleClose();
  };

  const handleClose = () => {
    stopCamera();
    setCapturedPhoto(null);
    setCameraError(null);
    onClose();
  };

  const handleNativeFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedPhoto(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="camera-modal-overlay">
      <div className="camera-modal-container">
        {/* Top Controls */}
        <div className="camera-top-bar">
          <span className="camera-header-title">
            <Camera size={18} className="text-purple" />
            <span>{capturedPhoto ? 'Review Photo' : 'Take Photo'}</span>
          </span>
          <button type="button" className="camera-close-btn" onClick={handleClose} title="Close Camera">
            <X size={22} />
          </button>
        </div>

        {/* Viewfinder / Preview Box */}
        <div className="camera-viewfinder">
          {/* Shutter flash animation */}
          {isFlashing && <div className="camera-flash-overlay" />}

          {!capturedPhoto ? (
            <>
              {cameraError ? (
                <div className="camera-error-view">
                  <AlertTriangle size={42} className="text-amber" />
                  <p className="err-title">Camera Unavailable</p>
                  <p className="err-sub">{cameraError}</p>
                  <button 
                    type="button" 
                    className="camera-fallback-btn"
                    onClick={() => fileFallbackRef.current?.click()}
                  >
                    <ImageIcon size={18} />
                    <span>Open Phone Camera / Gallery</span>
                  </button>
                </div>
              ) : (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`camera-video-stream ${facingMode === 'user' ? 'mirrored' : ''}`}
                />
              )}
            </>
          ) : (
            <img src={capturedPhoto} alt="Captured" className="camera-captured-preview" />
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <input 
            type="file" 
            ref={fileFallbackRef} 
            accept="image/*" 
            capture="environment" 
            onChange={handleNativeFileInput} 
            style={{ display: 'none' }} 
          />
        </div>

        {/* Bottom Shutter & Controls */}
        <div className="camera-bottom-bar">
          {!capturedPhoto ? (
            <div className="camera-controls-row">
              {/* Native Mobile Camera Direct Shortcut */}
              <button 
                type="button" 
                className="cam-control-icon-btn" 
                onClick={() => fileFallbackRef.current?.click()}
                title="System Camera App"
              >
                <ImageIcon size={22} />
              </button>

              {/* Big Circular Shutter Button */}
              <button 
                type="button" 
                className="camera-shutter-btn" 
                onClick={capturePhoto} 
                disabled={!!cameraError}
                title="Snap Photo"
              >
                <div className="shutter-inner" />
              </button>

              {/* Flip Camera Button */}
              {hasMultipleCameras ? (
                <button 
                  type="button" 
                  className="cam-control-icon-btn" 
                  onClick={handleFlipCamera}
                  title="Switch Front/Back Camera"
                >
                  <RefreshCw size={22} />
                </button>
              ) : (
                <div style={{ width: 44 }} />
              )}
            </div>
          ) : (
            <div className="camera-confirm-row">
              <button 
                type="button" 
                className="cam-btn retake" 
                onClick={handleRetake}
              >
                <RotateCcw size={18} />
                <span>Retake</span>
              </button>
              <button 
                type="button" 
                className="cam-btn confirm" 
                onClick={handleConfirmPhoto}
              >
                <Check size={18} />
                <span>Use Photo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
