import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RefreshCw } from 'lucide-react';
import PlayerAvatar from './primitives/PlayerAvatar';

export default function TrophyView({ room, onResetRoom, isHost }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return; // guards against StrictMode's double-invoke in dev
    firedRef.current = true;

    let cancelled = false;
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      if (cancelled) return;
      confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelled = true; };
  }, []);

  if (!room || !room.tournament) return null;

  const { teams, tournament } = room;
  const winnerTeam = teams.find(t => t.id === tournament.winnerTeamId) || teams[0];
  if (!winnerTeam) return null;

  return (
    <div className="page-wrap" style={{ maxWidth: 700, padding: '40px 20px', textAlign: 'center' }}>
      <div className="card" style={{ padding: 44, position: 'relative', overflow: 'hidden', border: '2px solid var(--signal-line)' }}>
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,176,32,0.15), transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          width: 68, height: 68, borderRadius: '50%', margin: '0 auto 18px',
          background: 'var(--signal-dim)', border: '2px solid var(--signal-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Trophy size={34} color="var(--signal)" />
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--signal)', marginBottom: 4 }}>IPL Champion</h1>
        <p className="eyebrow" style={{ marginBottom: 28 }}>Grand Final Winner</p>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 16,
          background: winnerTeam.color, color: '#0a0a0a',
          padding: '18px 32px', borderRadius: 16,
          boxShadow: `0 8px 30px ${winnerTeam.color}60`,
          marginBottom: 32,
        }}>
          <span style={{ fontSize: 44 }}>{winnerTeam.logo}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 26, lineHeight: 1.1 }}>{winnerTeam.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>{winnerTeam.city} franchise</div>
          </div>
        </div>

        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Champion squad
        </h3>
        <div className="grid-auto-fill" style={{ textAlign: 'left', marginBottom: 32 }}>
          {winnerTeam.squad.map(player => (
            <div key={player.id} style={{
              background: 'var(--ink-3)', border: '1px solid var(--line-1)',
              borderRadius: 10, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <PlayerAvatar player={player} size={34} teamColor={winnerTeam.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{player.role}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--signal)' }}>{player.rating}</span>
            </div>
          ))}
        </div>

        {isHost && (
          <button className="btn btn-signal btn-lg" onClick={onResetRoom}>
            <RefreshCw size={17} /> New IPL season
          </button>
        )}
      </div>
    </div>
  );
}
