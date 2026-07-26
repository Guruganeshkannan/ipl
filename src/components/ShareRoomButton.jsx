import React, { useState } from 'react';
import { Share2, MessageCircle, Copy, Check, X } from 'lucide-react';

function buildInviteText(roomCode, url) {
  return `🏏 Join my IPL Mega Room auction! Room code: ${roomCode}\n${url}`;
}

// Single chokepoint for "invite people to this room": tries the native
// share sheet first (this is what surfaces WhatsApp/Messages/etc. directly
// on phones), and falls back to a small menu with a WhatsApp deep link and
// a copy-to-clipboard button for desktop browsers that don't support it.
export default function ShareRoomButton({ roomCode, className = '', label = 'Share' }) {
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  const text = buildInviteText(roomCode, url);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'IPL Mega Room', text: buildInviteText(roomCode, ''), url });
        return;
      } catch {
        return; // user cancelled the native sheet — not an error
      }
    }
    setShowFallback(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <button className={`btn btn-ghost btn-sm ${className}`} onClick={handleShare} title="Invite friends to this room">
        <Share2 size={14} /> <span className="share-btn-label">{label}</span>
      </button>

      {showFallback && (
        <div className="squad-modal-backdrop" onClick={() => setShowFallback(false)}>
          <div className="share-fallback-card" onClick={e => e.stopPropagation()}>
            <div className="squad-modal-header">
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text-0)' }}>Invite friends</span>
              <button className="navbar-icon-btn" onClick={() => setShowFallback(false)} title="Close"><X size={15} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                className="btn btn-lg"
                style={{ background: '#25D366', color: '#052e18' }}
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={17} /> Share via WhatsApp
              </a>
              <button className="btn btn-ghost btn-lg" onClick={handleCopy}>
                {copied ? <Check size={16} color="var(--win-green)" /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy invite link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
