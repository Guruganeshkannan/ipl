import React, { useState } from 'react';
import { Trophy, Gavel, PlayCircle, PauseCircle, BarChart3, Users, RefreshCw, Copy, Check, LogOut } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, room, isHost, onTogglePause, onResetRoom, onLeave, userTeam }) {
  const [copied, setCopied] = useState(false);
  if (!room) return null;

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const tabs = [
    { key: 'LOBBY', label: 'Lobby', icon: <Users size={15} /> },
    { key: 'AUCTION', label: 'Auction', icon: <Gavel size={15} /> },
    { key: 'MATCHES', label: 'Matches', icon: <PlayCircle size={15} /> },
    { key: 'STANDINGS', label: 'Standings', icon: <BarChart3 size={15} /> },
  ];
  if (room.status === 'FINISHED') tabs.push({ key: 'TROPHY', label: 'Trophy', icon: <Trophy size={15} /> });

  const getAllowedTabs = () => {
    if (room.status === 'LOBBY') return ['LOBBY'];
    if (room.status === 'AUCTION') return ['LOBBY', 'AUCTION'];
    if (room.status === 'PRE_MATCH' || room.status === 'MATCHES') return ['LOBBY', 'AUCTION', 'MATCHES', 'STANDINGS'];
    return ['LOBBY', 'AUCTION', 'MATCHES', 'STANDINGS', 'TROPHY'];
  };
  const allowed = getAllowedTabs();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand">
          <div className="navbar-brand-mark"><Trophy size={17} strokeWidth={2.5} /></div>
          <span className="navbar-brand-text">IPL<span>ROOM</span></span>
        </div>

        <nav className="navbar-tabs">
          {tabs.map(t => {
            const isAllowed = allowed.includes(t.key);
            return (
              <button
                key={t.key}
                className={`navbar-tab ${activeTab === t.key ? 'active' : ''} ${isAllowed ? '' : 'locked'}`}
                onClick={() => isAllowed && setActiveTab(t.key)}
                disabled={!isAllowed}
                title={isAllowed ? '' : 'Phase not reached yet'}
              >
                {t.icon} <span className="tab-label">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="navbar-right">
          <button className="navbar-room-code" onClick={copyCode} title="Click to copy room code">
            <span className="navbar-code-label">ROOM</span>
            <span className="navbar-code-value">{room.code}</span>
            {copied ? <Check size={13} color="var(--win-green)" /> : <Copy size={13} color="var(--text-3)" />}
          </button>

          {userTeam && (
            <div className="navbar-team-badge" style={{ background: userTeam.color }}>
              <span style={{ fontSize: 15 }}>{userTeam.logo}</span>
              <span className="team-label">{userTeam.shortName}</span>
            </div>
          )}
          {isHost && <span className="badge badge-signal" title="You are the host">HOST</span>}

          {isHost && (
            <>
              <button className={`navbar-icon-btn ${room.isPaused ? 'is-active' : ''}`} onClick={onTogglePause} title={room.isPaused ? 'Resume' : 'Pause'}>
                {room.isPaused ? <PlayCircle size={17} /> : <PauseCircle size={17} />}
              </button>
              <button className="navbar-icon-btn" onClick={onResetRoom} title="Reset room">
                <RefreshCw size={15} />
              </button>
            </>
          )}

          <button className="navbar-icon-btn" onClick={onLeave} title="Leave room">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
