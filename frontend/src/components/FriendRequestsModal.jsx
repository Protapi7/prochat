import React, { useState, useEffect } from 'react';
import { 
  UserPlus, UserCheck, UserX, Check, X, Search, Clock, 
  Send, Users, AlertCircle, Sparkles, CheckCircle2 
} from 'lucide-react';
import { getServerUrl } from '../socket';

export default function FriendRequestsModal({ 
  isOpen, 
  onClose, 
  token, 
  currentUsername,
  onFriendAccepted 
}) {
  const [activeTab, setActiveTab] = useState('add'); // 'add' | 'incoming' | 'sent'
  const [targetInput, setTargetInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success' | 'error', text: '' }
  const [actionLoading, setActionLoading] = useState(false);

  const getApiUrl = (endpoint) => `${getServerUrl()}${endpoint}`;

  // Fetch friend requests
  const loadRequests = async () => {
    if (!token) return;
    try {
      const res = await fetch(getApiUrl('/api/friends/requests'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIncomingRequests(data.incoming || []);
        setOutgoingRequests(data.outgoing || []);
      }
    } catch (err) {
      console.error('Error fetching friend requests:', err);
    }
  };

  const loadUsersList = async (query = '') => {
    if (!token) return;
    setIsSearching(true);
    try {
      const res = await fetch(getApiUrl(`/api/users/search?q=${encodeURIComponent(query.trim())}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRequests();
      loadUsersList('');
      setStatusMsg(null);
    }
  }, [isOpen]);

  // Live search debounced on any input change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadUsersList(targetInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [targetInput, token, isOpen]);

  const handleSendRequest = async (target) => {
    const usernameToSend = target || targetInput.trim();
    if (!usernameToSend) {
      setStatusMsg({ type: 'error', text: 'Please enter a username, email, or phone number.' });
      return;
    }

    setActionLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch(getApiUrl('/api/friends/request'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ targetUsername: usernameToSend })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ type: 'success', text: data.message || 'Friend request sent!' });
        loadRequests();
        loadUsersList(targetInput);
        if (data.status === 'accepted' && onFriendAccepted) {
          onFriendAccepted();
        }
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to send friend request.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Server connection failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/friends/accept'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Friend request accepted!' });
        loadRequests();
        if (onFriendAccepted) onFriendAccepted();
      } else {
        const data = await res.json();
        setStatusMsg({ type: 'error', text: data.error || 'Failed to accept request.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Connection error.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrCancelRequest = async (requestId) => {
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/friends/reject'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        loadRequests();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel friend-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="header-title">
            <Users className="title-icon text-purple" size={22} />
            <h2>Friends & Contacts</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="friend-tabs">
          <button 
            type="button" 
            className={`friend-tab-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => { setActiveTab('add'); setStatusMsg(null); }}
          >
            <UserPlus size={16} />
            <span>Add Friend</span>
          </button>
          <button 
            type="button" 
            className={`friend-tab-btn ${activeTab === 'incoming' ? 'active' : ''}`}
            onClick={() => { setActiveTab('incoming'); setStatusMsg(null); }}
          >
            <Clock size={16} />
            <span>Incoming</span>
            {incomingRequests.length > 0 && (
              <span className="tab-badge">{incomingRequests.length}</span>
            )}
          </button>
          <button 
            type="button" 
            className={`friend-tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => { setActiveTab('sent'); setStatusMsg(null); }}
          >
            <Send size={16} />
            <span>Sent ({outgoingRequests.length})</span>
          </button>
        </div>

        {/* Status Message Notification */}
        {statusMsg && (
          <div className={`friend-status-banner ${statusMsg.type}`}>
            {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* TAB 1: ADD FRIEND */}
        {activeTab === 'add' && (
          <div className="friend-tab-content">
            <p className="tab-instructions">
              Send a friend request by typing their <strong>Username</strong>, <strong>Email</strong>, or <strong>Phone Number</strong>.
            </p>

            <form 
              className="friend-search-form" 
              onSubmit={(e) => { e.preventDefault(); handleSendRequest(); }}
            >
              <div className="input-with-icon">
                <Search size={18} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Enter username, email or mobile..."
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  autoFocus
                />
              </div>
              <button 
                type="submit" 
                className="btn-send-request" 
                disabled={actionLoading || !targetInput.trim()}
              >
                <UserPlus size={16} />
                <span>Send Request</span>
              </button>
            </form>

            {/* Live Search Results */}
            {isSearching && <div className="searching-spinner">Finding users...</div>}

            {searchResults.length > 0 ? (
              <div className="search-results-list">
                <div className="results-header">{targetInput.trim() ? 'Search Results:' : 'Discover Registered People:'}</div>
                {searchResults.map((user) => {
                  const rel = user.relation || {};
                  return (
                    <div key={user.id} className="user-search-card">
                      <div className="user-info">
                        <div className="avatar-circle">
                          {user.username.charAt(0).toUpperCase()}
                          {user.isOnline && <span className="online-indicator" />}
                        </div>
                        <div className="user-details">
                          <span className="username">@{user.username}</span>
                          <span className="meta">
                            {user.email || user.phone || (user.isOnline ? 'Online' : 'Offline')}
                          </span>
                        </div>
                      </div>

                      <div className="user-actions">
                        {rel.status === 'accepted' ? (
                          <span className="badge-friend"><UserCheck size={14} /> Friends</span>
                        ) : rel.status === 'pending' && rel.isSender ? (
                          <span className="badge-pending"><Clock size={14} /> Pending</span>
                        ) : rel.status === 'pending' && !rel.isSender ? (
                          <button 
                            type="button" 
                            className="btn-accept-sm"
                            onClick={() => handleAcceptRequest(rel.requestId)}
                            disabled={actionLoading}
                          >
                            <Check size={14} /> Accept
                          </button>
                        ) : (
                          <button 
                            type="button" 
                            className="btn-add-sm"
                            onClick={() => handleSendRequest(user.username)}
                            disabled={actionLoading}
                          >
                            <UserPlus size={14} /> Add Friend
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : targetInput.trim() && !isSearching ? (
              <div className="empty-requests">
                <Search size={32} className="empty-icon" />
                <p>No user found for "{targetInput}"</p>
                <span>You can still enter their exact username, email, or mobile number and tap "Send Request" above!</span>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 2: INCOMING REQUESTS */}
        {activeTab === 'incoming' && (
          <div className="friend-tab-content">
            {incomingRequests.length === 0 ? (
              <div className="empty-requests">
                <Clock size={36} className="empty-icon" />
                <p>No incoming friend requests.</p>
                <span>When someone sends you a friend request, it will appear here.</span>
              </div>
            ) : (
              <div className="requests-list">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="request-card">
                    <div className="user-info">
                      <div className="avatar-circle">
                        {req.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-details">
                        <span className="username">@{req.username}</span>
                        <span className="meta">Wants to connect with you</span>
                      </div>
                    </div>

                    <div className="request-actions">
                      <button 
                        type="button" 
                        className="btn-accept" 
                        onClick={() => handleAcceptRequest(req.id)}
                        disabled={actionLoading}
                        title="Accept friend request"
                      >
                        <Check size={16} />
                        <span>Accept</span>
                      </button>
                      <button 
                        type="button" 
                        className="btn-decline" 
                        onClick={() => handleRejectOrCancelRequest(req.id)}
                        disabled={actionLoading}
                        title="Decline friend request"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SENT REQUESTS */}
        {activeTab === 'sent' && (
          <div className="friend-tab-content">
            {outgoingRequests.length === 0 ? (
              <div className="empty-requests">
                <Send size={36} className="empty-icon" />
                <p>No sent requests pending.</p>
                <span>Requests you send to others will appear here until accepted.</span>
              </div>
            ) : (
              <div className="requests-list">
                {outgoingRequests.map((req) => (
                  <div key={req.id} className="request-card">
                    <div className="user-info">
                      <div className="avatar-circle">
                        {req.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-details">
                        <span className="username">@{req.username}</span>
                        <span className="meta">Awaiting response...</span>
                      </div>
                    </div>

                    <div className="request-actions">
                      <span className="badge-pending">
                        <Clock size={13} /> Pending
                      </span>
                      <button 
                        type="button" 
                        className="btn-cancel-req" 
                        onClick={() => handleRejectOrCancelRequest(req.id)}
                        disabled={actionLoading}
                        title="Cancel friend request"
                      >
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
