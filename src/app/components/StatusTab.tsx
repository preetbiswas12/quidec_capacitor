import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Camera, X, ChevronLeft, ChevronRight, Trash2, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

const STATUS_BACKGROUNDS = [
  '#4D91FB', '#1B72E8', '#E91E63', '#9C27B0',
  '#FF5722', '#795548', '#607D8B', '#F44336',
  '#3F51B5', '#009688', '#FF9800', '#4CAF50',
  '#1A1A2E', '#16213E', '#0F3460', '#533483',
];

export default function StatusTab() {
  const {
    contacts, statuses, currentUser, myStatuses,
    addStatus, deleteMyStatus, viewStatus,
    activeStatusViewer, setActiveStatusViewer,
  } = useApp();

  const [showCreate, setShowCreate] = useState(false);
  const [newStatusText, setNewStatusText] = useState('');
  const [newStatusBg, setNewStatusBg] = useState(STATUS_BACKGROUNDS[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Group statuses by contact
  const statusesByContact = new Map<string, typeof statuses>();
  for (const s of statuses) {
    const list = statusesByContact.get(s.contactId) || [];
    list.push(s);
    statusesByContact.set(s.contactId, list);
  }

  // Sort: unviewed first, then by timestamp
  const sortedContacts = [...statusesByContact.entries()].sort((a, b) => {
    const aUnviewed = a[1].some(s => !s.viewed) ? 0 : 1;
    const bUnviewed = b[1].some(s => !s.viewed) ? 0 : 1;
    if (aUnviewed !== bUnviewed) return aUnviewed - bUnviewed;
    return new Date(b[1][0].timestamp).getTime() - new Date(a[1][0].timestamp).getTime();
  });

  const unviewedCount = statuses.filter(s => !s.viewed && s.contactId !== currentUser?.userId).length;

  const handleCreateStatus = async () => {
    if (!newStatusText.trim()) return;
    await addStatus(newStatusText.trim(), 'text', newStatusBg);
    setNewStatusText('');
    setNewStatusBg(STATUS_BACKGROUNDS[0]);
    setShowCreate(false);
  };

  const handleViewStatus = (contactId: string, statusIndex: number) => {
    const contactStatuses = statusesByContact.get(contactId);
    if (!contactStatuses) return;
    const status = contactStatuses[statusIndex];
    if (status && !status.viewed && contactId !== currentUser?.userId) {
      viewStatus(contactId, status.id);
    }
    setActiveStatusViewer({ contactId, statusIndex });
  };

  const getContact = (id: string) => contacts.find(c => c.id === id);

  // Auto-focus textarea when create modal opens
  useEffect(() => {
    if (showCreate && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showCreate]);

  return (
    <div className="flex flex-col h-full overflow-y-auto relative">
      {/* My Status */}
      <div className="px-4 py-4 border-b border-wa-border/10">
        <h3 className="text-wa-text-muted mb-3 px-1" style={{ fontSize: '0.8rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          My Status
        </h3>

        {/* Existing my statuses */}
        {myStatuses.length > 0 && (
          <div className="flex gap-3 mb-3 overflow-x-auto pb-2">
            {myStatuses.map(status => (
              <MyStatusThumb
                key={status.id}
                status={status}
                onDelete={() => deleteMyStatus(status.id)}
              />
            ))}
          </div>
        )}

        {/* Add status button */}
        <div
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-wa-secondary transition-colors cursor-pointer"
        >
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-[#DFE5E7] flex items-center justify-center overflow-hidden">
              {currentUser?.avatar ? (
                <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#DFE5E7] flex items-center justify-center">
                  <span className="text-wa-text-muted" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                    {currentUser?.name ? currentUser.name[0].toUpperCase() : '?'}
                  </span>
                </div>
              )}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-wa-accent rounded-full flex items-center justify-center border-2 border-wa-main">
              <Plus size={10} className="text-white" />
            </div>
          </div>
          <div>
            <p className="text-wa-primary" style={{ fontWeight: 500 }}>My status</p>
            <p className="text-wa-text-muted" style={{ fontSize: '0.8rem' }}>
              {myStatuses.length > 0 ? `${myStatuses.length} update${myStatuses.length !== 1 ? 's' : ''} · Tap to add more` : 'Tap to add status update'}
            </p>
          </div>
        </div>
      </div>

      {/* Contacts' Status Updates */}
      {sortedContacts.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-wa-text-muted mb-2 px-1" style={{ fontSize: '0.8rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Recent Updates {unviewedCount > 0 ? `(${unviewedCount} new)` : ''}
          </h3>
          {sortedContacts.map(([contactId, contactStatuses]) => {
            const contact = getContact(contactId);
            if (!contact) return null;
            const hasUnviewed = contactStatuses.some(s => !s.viewed);
            return (
              <StatusItem
                key={contactId}
                contact={contact}
                statusCount={contactStatuses.length}
                hasUnviewed={hasUnviewed}
                timestamp={contactStatuses[0]?.timestamp || ''}
                onClick={() => handleViewStatus(contactId, 0)}
              />
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {sortedContacts.length === 0 && myStatuses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-8 gap-3 text-center">
          <div className="w-20 h-20 rounded-full bg-wa-secondary/50 flex items-center justify-center border border-wa-border/20">
            <Camera size={32} className="text-wa-text-muted opacity-50" />
          </div>
          <p className="text-wa-primary" style={{ fontSize: '1rem', fontWeight: 600 }}>No status updates</p>
          <p className="text-wa-text-muted" style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
            Share text, photos, and videos with your contacts. Updates disappear after 24 hours.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 px-6 py-2.5 rounded-full bg-wa-accent text-white font-semibold text-sm hover:bg-[#06cf9c] transition-colors"
          >
            Share your first status
          </button>
        </div>
      )}

      {/* Camera FAB */}
      <div className="fixed bottom-20 right-4 md:hidden flex flex-col gap-3 items-end">
        <button
          onClick={() => setShowCreate(true)}
          className="w-12 h-12 rounded-full bg-wa-secondary flex items-center justify-center shadow-lg hover:bg-wa-secondary/80 transition-colors"
        >
          <Camera size={20} className="text-wa-text-muted" />
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="w-14 h-14 rounded-full bg-wa-accent flex items-center justify-center shadow-lg hover:bg-[#06cf9c] transition-colors"
        >
          <Plus size={24} className="text-white" />
        </button>
      </div>

      {/* ── Create Status Overlay ── */}
      {showCreate && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: newStatusBg }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 pt-safe">
            <button
              onClick={() => { setShowCreate(false); setNewStatusText(''); }}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={22} />
            </button>
            <span className="text-white font-semibold" style={{ fontSize: '0.95rem' }}>New Status</span>
            <button
              onClick={handleCreateStatus}
              disabled={!newStatusText.trim()}
              className={`px-4 py-1.5 rounded-full font-semibold text-sm transition-all ${
                newStatusText.trim()
                  ? 'bg-white text-gray-900 hover:bg-white/90 active:scale-95'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
              }`}
            >
              Share
            </button>
          </div>

          {/* Text input area */}
          <div className="flex-1 flex items-center justify-center px-8">
            <textarea
              ref={textareaRef}
              value={newStatusText}
              onChange={e => setNewStatusText(e.target.value)}
              placeholder="Type a status update..."
              maxLength={500}
              className="w-full bg-transparent text-white text-center placeholder-white/40 outline-none resize-none"
              style={{ fontSize: '1.4rem', lineHeight: '1.5', minHeight: '120px' }}
            />
          </div>

          {/* Character count */}
          <div className="text-center pb-2">
            <span className="text-white/40" style={{ fontSize: '0.75rem' }}>
              {newStatusText.length}/500
            </span>
          </div>

          {/* Background color picker */}
          <div className="px-4 pb-6 pt-2">
            <p className="text-white/50 text-center mb-3" style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '1px' }}>
              BACKGROUND COLOR
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {STATUS_BACKGROUNDS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewStatusBg(color)}
                  className={`w-9 h-9 rounded-full transition-all ${
                    newStatusBg === color
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Status Viewer Overlay ── */}
      {activeStatusViewer && (
        <StatusViewer
          contactId={activeStatusViewer.contactId}
          initialIndex={activeStatusViewer.statusIndex}
          statusesByContact={statusesByContact}
          contacts={contacts}
          currentUser={currentUser}
          onClose={() => setActiveStatusViewer(null)}
          onViewStatus={viewStatus}
          onDeleteStatus={deleteMyStatus}
        />
      )}
    </div>
  );
}

/* ── My Status Thumbnail ── */
function MyStatusThumb({ status, onDelete }: { status: any; onDelete: () => void }) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-16 h-20 rounded-lg overflow-hidden cursor-pointer border-2 border-wa-border/20 hover:border-wa-accent/50 transition-colors"
        style={{ backgroundColor: status.backgroundColor || '#4D91FB' }}
        onClick={() => setShowDelete(!showDelete)}
      >
        <div className="w-full h-full flex items-center justify-center p-1.5">
          <p className="text-white text-center line-clamp-3" style={{ fontSize: '0.6rem', lineHeight: '1.3' }}>
            {status.content}
          </p>
        </div>
      </div>
      {showDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); setShowDelete(false); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
        >
          <Trash2 size={10} className="text-white" />
        </button>
      )}
      <p className="text-wa-text-muted text-center mt-1" style={{ fontSize: '0.6rem' }}>
        {formatTime(status.timestamp)}
      </p>
    </div>
  );
}

/* ── Status List Item ── */
function StatusItem({
  contact, statusCount, hasUnviewed, timestamp, onClick,
}: {
  contact: any;
  statusCount: number;
  hasUnviewed: boolean;
  timestamp: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-wa-secondary/30 cursor-pointer transition-colors"
    >
      <div className="relative">
        <div className={`w-14 h-14 rounded-full p-0.5 ${
          hasUnviewed
            ? 'bg-gradient-to-br from-wa-accent to-[#34b7f1]'
            : 'bg-wa-text-muted'
        }`}>
          <div className="w-full h-full rounded-full p-0.5 bg-wa-main">
            <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} />
          </div>
        </div>
        {statusCount > 1 && (
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-wa-accent rounded-full flex items-center justify-center border-2 border-wa-main">
            <span className="text-white" style={{ fontSize: '0.6rem', fontWeight: 700 }}>{statusCount}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-wa-primary" style={{ fontWeight: 500 }}>{contact.name}</p>
        <p className="text-wa-text-muted truncate" style={{ fontSize: '0.8rem' }}>
          {hasUnviewed ? 'New update' : formatTime(timestamp)}
          {statusCount > 1 ? ` · ${statusCount} updates` : ''}
        </p>
      </div>
      {hasUnviewed && (
        <div className="w-2.5 h-2.5 rounded-full bg-wa-accent flex-shrink-0" />
      )}
    </div>
  );
}

/* ── Full-Screen Status Viewer ── */
function StatusViewer({
  contactId, initialIndex, statusesByContact, contacts, currentUser,
  onClose, onViewStatus, onDeleteStatus,
}: {
  contactId: string;
  initialIndex: number;
  statusesByContact: Map<string, any[]>;
  contacts: any[];
  currentUser: any;
  onClose: () => void;
  onViewStatus: (contactId: string, statusId: string) => void;
  onDeleteStatus: (statusId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const contactStatuses = statusesByContact.get(contactId) || [];
  const status = contactStatuses[index];
  const contact = contacts.find(c => c.id === contactId);
  const isOwn = contactId === currentUser?.userId;
  const progressRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DURATION = 6000; // 6 seconds per status

  // Mark as viewed when viewing someone else's status
  useEffect(() => {
    if (status && !isOwn && !status.viewed) {
      onViewStatus(contactId, status.id);
    }
  }, [status, isOwn, contactId, onViewStatus]);

  // Auto-advance progress bar
  useEffect(() => {
    if (!progressRef.current) return;
    progressRef.current.style.transition = 'none';
    progressRef.current.style.width = '0%';

    requestAnimationFrame(() => {
      if (!progressRef.current) return;
      progressRef.current.style.transition = `width ${DURATION}ms linear`;
      progressRef.current.style.width = '100%';
    });

    timerRef.current = setTimeout(() => {
      if (index < contactStatuses.length - 1) {
        setIndex(i => i + 1);
      } else {
        onClose();
      }
    }, DURATION);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, contactStatuses.length, onClose]);

  const goNext = useCallback(() => {
    if (index < contactStatuses.length - 1) {
      setIndex(i => i + 1);
    } else {
      onClose();
    }
  }, [index, contactStatuses.length, onClose]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setIndex(i => i - 1);
    }
  }, [index]);

  if (!status || !contact) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ backgroundColor: status.backgroundColor || '#111B21' }}
    >
      {/* Progress bars */}
      <div className="flex gap-1 px-3 pt-safe pb-2">
        {contactStatuses.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{
                width: i < index ? '100%' : i === index ? '0%' : '0%',
                transition: i === index ? `width ${DURATION}ms linear` : 'none',
              }}
              ref={i === index ? progressRef : undefined}
            />
          </div>
        ))}
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={36} />
          <div className="min-w-0">
            <p className="text-white font-medium truncate" style={{ fontSize: '0.9rem' }}>
              {isOwn ? 'My status' : contact.name}
            </p>
            <p className="text-white/50" style={{ fontSize: '0.7rem' }}>
              {formatTime(status.timestamp)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isOwn && (
            <button
              onClick={() => { onDeleteStatus(status.id); }}
              className="text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Delete status"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Status content */}
      <div className="flex-1 flex items-center justify-center px-8">
        {status.type === 'text' ? (
          <p
            className="text-white text-center max-w-sm"
            style={{ fontSize: '1.3rem', lineHeight: '1.5' }}
          >
            {status.content}
          </p>
        ) : status.type === 'image' && status.imageUrl ? (
          <img
            src={status.imageUrl}
            alt="Status"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        ) : null}
      </div>

      {/* View count (own status) */}
      {isOwn && status.viewed !== undefined && (
        <div className="flex items-center justify-center gap-2 pb-6 text-white/50">
          <Eye size={14} />
          <span style={{ fontSize: '0.75rem' }}>Viewed</span>
        </div>
      )}

      {/* Navigation areas (click to go prev/next) */}
      <div className="absolute inset-0 flex pointer-events-none">
        <button
          onClick={goPrev}
          className="w-1/3 h-full pointer-events-auto flex items-center justify-start pl-2 opacity-0 hover:opacity-100 transition-opacity"
          aria-label="Previous"
        >
          {index > 0 && <ChevronLeft size={28} className="text-white/60" />}
        </button>
        <div className="w-1/3 h-full" />
        <button
          onClick={goNext}
          className="w-1/3 h-full pointer-events-auto flex items-center justify-end pr-2 opacity-0 hover:opacity-100 transition-opacity"
          aria-label="Next"
        >
          {index < contactStatuses.length - 1 && <ChevronRight size={28} className="text-white/60" />}
        </button>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function formatTime(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}
