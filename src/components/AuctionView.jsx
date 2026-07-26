import React, { useState, useEffect, useRef } from 'react';
import { Gavel, ChevronDown, Send, X } from 'lucide-react';
import PlayerAvatar from './primitives/PlayerAvatar';

const ROLE_ICON = { Bowler: '🎯', 'Wicket-Keeper': '🧤', 'All-Rounder': '⚡', Batsman: '🏏' };

export default function AuctionView({ room, playersById, onPlaceBid, onSendChat, onTogglePause, isHost, onLeave, userTeamId }) {
  const [chatInput, setChatInput] = useState('');
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [bidError, setBidError] = useState(null);
  const [squadTeamId, setSquadTeamId] = useState(null);
  const chatEndRef = useRef(null);
  const audioCtxRef = useRef(null);

  const auction = room?.auction;
  const teams = room?.teams || [];
  const chat = room?.chat || [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  // Single shared AudioContext, reused across ticks instead of leaked one-per-second.
  useEffect(() => {
    return () => { audioCtxRef.current?.close(); };
  }, []);

  useEffect(() => {
    if (!auction) return;
    if (auction.timer <= 3 && auction.timer > 0 && auction.timerActive) {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        const now = ctx.currentTime;
        const duration = 0.35;

        // Two slightly-detuned square oscillators through a lowpass filter —
        // reads as a harsh electric buzzer rather than a soft beep/ping.
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        gain.connect(filter);
        filter.connect(ctx.destination);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
        gain.gain.setValueAtTime(0.16, now + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        [220, 224].forEach(freq => {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + duration);
        });
      } catch { /* audio unsupported — non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction?.timer]);

  if (!auction) return null;

  const player = auction.currentPlayer;
  const phase = auction.phase || auction.status;
  const isBidding = phase === 'BIDDING';
  const isSold = phase === 'SOLD';
  const isUnsold = phase === 'UNSOLD';
  const isSetIntro = phase === 'SET_INTRO';
  const currentBidderTeam = teams.find(t => t.id === auction.currentBidder);
  const userTeam = teams.find(t => t.id === userTeamId);
  const canBid = isBidding && userTeam && userTeam.id !== auction.currentBidder && userTeam.squad.length < room.maxSquadSize;

  const handleBid = () => {
    if (!userTeam) return;
    onPlaceBid(userTeam.id, (result) => {
      if (result && !result.ok) {
        setBidError(result.reason);
        setTimeout(() => setBidError(null), 2000);
      }
    });
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (chatInput.trim()) { onSendChat(chatInput); setChatInput(''); }
  };

  const liveColor = currentBidderTeam?.color || 'var(--signal)';
  const liveRgb = currentBidderTeam ? hexToRgb(currentBidderTeam.color) : '255, 176, 32';

  return (
    <div className={`auction-stage ${isSold ? 'is-sold' : ''}`} style={{ '--live': liveColor, '--live-rgb': liveRgb }}>
      {isSold && (
        <div className="sold-stamp">
          <h1>SOLD!</h1>
          <div style={{ fontSize: 22, fontWeight: 700, color: liveColor, fontFamily: 'var(--font-heading)' }}>{currentBidderTeam?.name}</div>
          {currentBidderTeam?.ownerName && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>{currentBidderTeam.ownerName}</div>
          )}
          <div style={{ fontSize: 38, fontWeight: 900, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>₹{auction.currentBid.toFixed(2)} CR</div>
        </div>
      )}
      {isUnsold && (
        <div className="sold-stamp">
          <h1 style={{ color: 'var(--text-2)', fontSize: 'clamp(40px, 8vw, 90px)' }}>UNSOLD</h1>
        </div>
      )}
      {isSetIntro && (
        <div className="set-intro-card">
          <span className="eyebrow">NEXT SET</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 64px)', color: 'var(--text-0)' }}>{auction.currentSetName}</h1>
        </div>
      )}

      {/* Auction-specific top bar (Leave/Pause live in the real Navbar above) */}
      <div className="auction-topbar">
        <div className="auction-topbar-left">
          <span className="badge badge-live"><span className="live-dot" /> LIVE</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{auction.currentSetName || '—'}</span>
        </div>
        <div className="auction-topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowUpcoming(v => !v)}>
            Upcoming ({auction.remainingCount}) <ChevronDown size={14} />
          </button>
          <div className={`auction-timer ${auction.timer <= 5 && auction.timerActive ? 'critical' : ''}`}>
            {auction.timerActive ? auction.timer : '–'}
          </div>
        </div>
      </div>

      {showUpcoming && (
        <div className="upcoming-panel">
          {(auction.upcomingPreview || []).map(p => (
            <div key={p.id} className="upcoming-row">
              <PlayerAvatar player={p} size={32} teamColor="var(--ink-4)" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROLE_ICON[p.role]} {p.role} · ₹{p.basePrice} Cr</div>
              </div>
            </div>
          ))}
          {(!auction.upcomingPreview || auction.upcomingPreview.length === 0) && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Set complete</div>
          )}
        </div>
      )}

      <div className="auction-body">
        {/* Player panel */}
        <div className="auction-player-panel">
          {player ? (
            <>
              <PlayerAvatar player={player} size={160} teamColor={liveColor} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 24, color: 'var(--text-0)', textTransform: 'uppercase' }}>{player.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                  {ROLE_ICON[player.role]} {player.role} · {player.isOverseas ? <span style={{ color: 'var(--info-cyan)' }}>✈ OVERSEAS</span> : <span style={{ color: 'var(--win-green)' }}>🇮🇳 {player.nationality}</span>}
                </div>
              </div>
              <div className="card" style={{ width: '100%', padding: 16, display: 'flex', justifyContent: 'space-around' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Batting</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-0)' }}>{player.battingSkill}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Bowling</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-0)' }}>{player.bowlingSkill}</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Base price</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--signal)' }}>₹{player.basePrice.toFixed(2)} CR</div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1 }} />
          )}
        </div>

        {/* Center */}
        <div className="auction-center">
          {player && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Current bid</div>
                <div className="bid-ticker"><span className="amount">₹{auction.currentBid.toFixed(2)}</span><span style={{ fontSize: 22, color: 'var(--text-2)' }}>CR</span></div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {currentBidderTeam ? (
                  <>
                    <span style={{ fontSize: 24 }}>{currentBidderTeam.logo}</span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: currentBidderTeam.color, lineHeight: 1.2 }}>{currentBidderTeam.name}</div>
                      {currentBidderTeam.ownerName && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{currentBidderTeam.ownerName}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-3)', fontSize: 14 }}>Waiting for first bid…</span>
                )}
              </div>

              {auction.bidHistory?.length > 0 && (
                <div className="bid-history-strip">
                  {auction.bidHistory.map((b, i) => {
                    const t = teams.find(x => x.id === b.teamId);
                    return <span key={i} className="bid-history-chip" style={{ color: t?.color }}>{t?.shortName} ₹{b.amount.toFixed(2)}</span>;
                  })}
                </div>
              )}

              <div className="auction-action-bar">
                {userTeam && (
                  <>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>Your purse</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--win-green)' }}>₹{userTeam.purse.toFixed(2)} Cr</div>
                    </div>
                    <div style={{ width: 1, height: 32, background: 'var(--line-2)' }} />
                  </>
                )}
                <button className="btn btn-signal btn-lg" onClick={handleBid} disabled={!canBid}>
                  <Gavel size={17} /> Bid ₹{auction.nextBid?.toFixed(2)} CR
                </button>
              </div>
              {bidError && <div style={{ color: 'var(--live-red)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{bidErrorMessage(bidError)}</div>}
            </>
          )}
        </div>

        {/* Teams + chat */}
        <div className="auction-teams-panel">
          <div style={{ flex: '0 0 auto', maxHeight: '42%', overflowY: 'auto' }}>
            {teams.map(t => (
              <button
                key={t.id}
                className={`franchise-row franchise-row-btn ${t.id === auction.currentBidder ? 'is-bidder' : ''} ${t.id === userTeamId ? 'is-user' : ''}`}
                onClick={() => setSquadTeamId(t.id)}
                title={`View ${t.name} squad`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 15 }}>{t.logo}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="franchise-name" style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.shortName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.ownerName || 'AI bot'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--win-green)', fontSize: 12 }}>₹{t.purse.toFixed(1)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{t.squad.length}/{room.maxSquadSize} players</div>
                </div>
              </button>
            ))}
          </div>

          <div className="chat-dock">
            <div className="chat-messages">
              {chat.map(m => (
                <div key={m.id} className="chat-msg">
                  <span className="sender" style={{ color: m.teamId === userTeamId ? 'var(--info-cyan)' : 'var(--signal)' }}>{m.sender}: </span>
                  <span style={{ color: 'var(--text-1)' }}>{m.message}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-form" onSubmit={handleChatSubmit}>
              <input placeholder="Send a message…" value={chatInput} onChange={e => setChatInput(e.target.value)} />
              <button type="submit" className="chat-send-btn"><Send size={14} /></button>
            </form>
          </div>
        </div>
      </div>

      {squadTeamId && (
        <SquadModal team={teams.find(t => t.id === squadTeamId)} maxSquadSize={room.maxSquadSize} onClose={() => setSquadTeamId(null)} />
      )}
    </div>
  );
}

function SquadModal({ team, maxSquadSize, onClose }) {
  if (!team) return null;
  return (
    <div className="squad-modal-backdrop" onClick={onClose}>
      <div className="squad-modal" onClick={e => e.stopPropagation()}>
        <div className="squad-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>{team.logo}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, color: team.color }}>{team.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{team.ownerName || 'AI bot'} · {team.squad.length}/{maxSquadSize} players · ₹{team.purse.toFixed(2)} Cr left</div>
            </div>
          </div>
          <button className="navbar-icon-btn" onClick={onClose} title="Close"><X size={15} /></button>
        </div>
        <div className="squad-modal-list">
          {team.squad.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No players bought yet.</div>
          )}
          {team.squad.map(p => (
            <div key={p.id} className="squad-modal-row">
              <PlayerAvatar player={p} size={36} teamColor={team.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROLE_ICON[p.role]} {p.role}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--signal)' }}>₹{p.soldPrice.toFixed(2)} Cr</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return '255, 176, 32';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

function bidErrorMessage(reason) {
  switch (reason) {
    case 'PURSE_RESERVE': return "Not enough purse left to fill your remaining squad slots.";
    case 'INSUFFICIENT_PURSE': return 'Insufficient purse for this bid.';
    case 'ALREADY_HIGH': return "You're already the highest bidder.";
    case 'SQUAD_FULL': return 'Your squad is already full.';
    default: return 'Bid rejected.';
  }
}
