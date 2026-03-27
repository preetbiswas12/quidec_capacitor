import { useState } from 'react'
import '../styles/friend-requests-modal.css'

export default function FriendRequestsModal({
  onClose,
  incomingRequests,
  outgoingRequests,
  onAccept,
  onReject,
  onSendRequest,
  onRefresh,
}) {
  const [activeTab, setActiveTab] = useState('incoming')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  
  // Debug: Log what we receive
  console.log('🎯 FriendRequestsModal received:', { incomingRequests, outgoingRequests });

  const handleSendRequest = () => {
    console.log('\n========== 📤 SEND FRIEND REQUEST (ID ONLY) ==========');
    console.log('Step 1️⃣: Validating input...');
    
    const trimmedInput = input.trim();
    setError('');

    if (!trimmedInput) {
      console.warn('❌ Input is empty');
      setError('Enter an 8-digit user ID');
      return;
    }

    // Validate 8-digit ID only
    if (!/^\d{8}$/.test(trimmedInput)) {
      console.warn('❌ Invalid format - must be exactly 8 digits');
      setError('Invalid format. Must be exactly 8 digits.');
      return;
    }

    console.log(`✅ Input: "${trimmedInput}" (8-digit ID)`);
    console.log('\nStep 2️⃣: Sending request...');

    try {
      onSendRequest(trimmedInput);
      console.log('✅ Request sent successfully!');
      console.log('Step 3️⃣: Cleaning up...');
      setInput('');
      setActiveTab('outgoing');
      console.log('========== ✅ PROCESS COMPLETE ==========\n');
    } catch (err) {
      console.error('❌ Error sending request:', err.message);
      setError('Failed to send request: ' + err.message);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    setError(''); // Clear error when user starts typing
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      console.log('⌨️ Enter pressed in input field');
      handleSendRequest();
    }
  };

  return (
    <div className="requests-modal-overlay" onClick={onClose}>
      <div className="requests-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="requests-modal-header">
          <h2>Friend Requests</h2>
          <div style={{display: 'flex', gap: '8px'}}>
            {onRefresh && (
              <button 
                className="refresh-btn" 
                onClick={onRefresh}
                title="Refresh requests"
                style={{padding: '8px 12px', fontSize: '18px', cursor: 'pointer', background: 'transparent', border: 'none'}}
              >
                🔄
              </button>
            )}
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="requests-tabs">
          <button
            className={`tab-btn ${activeTab === 'incoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('incoming')}
          >
            Incoming ({incomingRequests.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'outgoing' ? 'active' : ''}`}
            onClick={() => setActiveTab('outgoing')}
          >
            Outgoing ({outgoingRequests.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'send' ? 'active' : ''}`}
            onClick={() => setActiveTab('send')}
          >
            Send
          </button>
        </div>

        <div className="requests-list-container">
          {activeTab === 'incoming' && (
            <div className="requests-list">
              {!incomingRequests || incomingRequests.length === 0 ? (
                <div className="empty-state">
                  <p>No incoming requests</p>
                  {!incomingRequests && <p style={{fontSize: '12px', color: '#666'}}>Debug: incomingRequests is null/undefined</p>}
                </div>
              ) : (
                incomingRequests.map((req) => {
                  // Handle both formats: {sender, sentAt} or just string
                  const sender = typeof req === 'string' ? req : req.sender;
                  const sentAt = typeof req === 'string' ? null : req.sentAt;
                  const sentAtText = sentAt ? new Date(sentAt).toLocaleDateString() : '';
                  
                  return (
                    <div key={sender} className="request-item">
                      <div className="request-info">
                        <span className="request-username">{sender}</span>
                        <span className="request-type">sent you a request</span>
                        {sentAtText && <span className="request-time">{sentAtText}</span>}
                      </div>
                      <div className="request-actions">
                        <button
                          className="accept-btn"
                          onClick={() => onAccept(sender)}
                          title="Accept"
                        >
                          ✓
                        </button>
                        <button
                          className="reject-btn"
                          onClick={() => onReject(sender)}
                          title="Reject"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'outgoing' && (
            <div className="requests-list">
              {outgoingRequests.length === 0 ? (
                <div className="empty-state">
                  <p>No outgoing requests</p>
                </div>
              ) : (
                outgoingRequests.map((req) => {
                  // Handle both formats: {recipient, sentAt} or just string
                  const recipient = typeof req === 'string' ? req : req.recipient;
                  const sentAt = typeof req === 'string' ? null : req.sentAt;
                  const sentAtText = sentAt ? new Date(sentAt).toLocaleDateString() : '';
                  
                  return (
                    <div key={recipient} className="request-item outgoing">
                      <div className="request-info">
                        <span className="request-username">{recipient}</span>
                        <span className="request-type">pending...</span>
                        {sentAtText && <span className="request-time">{sentAtText}</span>}
                      </div>
                      <span className="pending-badge">⏳</span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'send' && (
            <div className="send-request-form">
              <div className="form-group">
                <label>🆔 Enter 8-digit User ID</label>
                <input
                  type="text"
                  placeholder="12345678"
                  value={input}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginBottom: '8px',
                    borderRadius: '4px',
                    border: '1px solid #456882',
                    background: 'rgba(27, 60, 83, 0.3)',
                    color: '#E3E3E3',
                  }}
                />
                {error && (
                  <p style={{color: '#ff6b6b', fontSize: '12px', marginBottom: '10px'}}>
                    ❌ {error}
                  </p>
                )}
              </div>
              <button
                className="send-request-btn"
                onClick={handleSendRequest}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: input ? '#234C6A' : '#456882',
                  color: '#E3E3E3',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: input ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  transition: 'background 0.2s',
                }}
                disabled={!input}
              >
                Send Request
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
