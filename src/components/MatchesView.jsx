import React, { useState, useEffect } from 'react';
import { PauseCircle, LogOut } from 'lucide-react';

const MOVE_AUTO_PICK_TICKS = 15;

export default function MatchesView({ room, onSelectChoice, onLeave, userTeamId }) {
  const [localChoice, setLocalChoice] = useState(null);

  const tournament = room?.tournament;
  const teams = room?.teams;
  const isPaused = room?.isPaused;
  const currentRoundObj = tournament?.rounds?.[tournament.currentRound];

  const userMatch = userTeamId && currentRoundObj
    ? currentRoundObj.matches.find(m => m.team1Id === userTeamId || m.team2Id === userTeamId)
    : null;

  // Reset the optimistic local pick whenever a new ball resolves for this match
  // (lastBatChoice/lastBowlChoice change) or the match id changes.
  useEffect(() => {
    setLocalChoice(null);
  }, [userMatch?.lastBatChoice, userMatch?.lastBowlChoice, userMatch?.id]);

  if (!room || !tournament || !tournament.rounds) return null;

  if (!currentRoundObj) {
    return (
      <div className="page-wrap" style={{ maxWidth: 600, margin: '48px auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: 48 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 22, color: 'var(--text-0)', marginBottom: 8 }}>
            Tournament complete
          </h2>
          <p style={{ color: 'var(--text-2)' }}>Check the Trophy tab for the IPL champion!</p>
        </div>
      </div>
    );
  }

  const isUserBatting = userMatch && userMatch.battingTeamId === userTeamId;
  // The server masks the opponent's pending choice to 'HIDDEN'; our own pick
  // lives in local state the moment we send it, so we never need to trust
  // the server echo of our own selection either.
  const userChoiceSelected = localChoice;

  if (userMatch && userMatch.status !== 'COMPLETED') {
    const isTeam1 = userMatch.team1Id === userTeamId;
    const oppTeamId = isTeam1 ? userMatch.team2Id : userMatch.team1Id;

    const userFranchise = teams.find(t => t.id === userTeamId);
    const oppFranchise = teams.find(t => t.id === oppTeamId);

    const userRuns = isTeam1 ? userMatch.runs1 : userMatch.runs2;
    const userWkts = isTeam1 ? userMatch.wickets1 : userMatch.wickets2;
    const oppRuns = isTeam1 ? userMatch.runs2 : userMatch.runs1;
    const oppWkts = isTeam1 ? userMatch.wickets2 : userMatch.wickets1;

    const currentOvers = userMatch.innings === 1 ? userMatch.overs1 : userMatch.overs2;

    const userLastChoice = isUserBatting ? userMatch.lastBatChoice : userMatch.lastBowlChoice;
    const oppLastChoice = isUserBatting ? userMatch.lastBowlChoice : userMatch.lastBatChoice;

    const leftHandImg = userChoiceSelected ? `/img/${userChoiceSelected}.png` : userLastChoice ? `/img/${userLastChoice}.png` : `/img/closed.png`;
    const rightHandImg = oppLastChoice ? `/img/${oppLastChoice}.png` : `/img/closed.png`;

    const waitTicks = userMatch.waitTicks || 0;
    const secondsLeft = Math.max(0, Math.ceil((MOVE_AUTO_PICK_TICKS - waitTicks) * 1.2));
    const trackPct = Math.min(100, (waitTicks / MOVE_AUTO_PICK_TICKS) * 100);

    const handleChoice = (n) => {
      if (userChoiceSelected) return;
      setLocalChoice(n);
      onSelectChoice(userMatch.id, userTeamId, n);
    };

    return (
      <div className="match-stage">
        <div className="match-topbar">
          <div className="score-card">
            <div className="score-card-header">
              <div className="player-avatar" style={{ width: 42, height: 42, border: '2px solid var(--signal)', background: userFranchise.color, fontSize: 22 }}>{userFranchise.logo}</div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#fff' }}>{userFranchise.ownerName?.split(' ')[0] || 'You'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 18 }}>{isUserBatting ? '🏏' : '🔴'}</span>
            </div>
            <div className="score-value">{userRuns} / {userWkts}</div>
          </div>

          <div className="match-center-info">
            <div className="eyebrow" style={{ color: 'var(--info-cyan)', marginBottom: 6 }}>TARGET: {userMatch.target ? userMatch.target : '--'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 3 }}>OVER {currentOvers.toFixed(1)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{userMatch.innings === 1 ? 'First innings' : 'Second innings'}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <button className="leave-game-btn" onClick={onLeave}><LogOut size={15} /> Leave game</button>
            <div className="score-card">
              <div className="score-card-header">
                <span style={{ marginRight: 'auto', fontSize: 18 }}>{!isUserBatting ? '🏏' : '🔴'}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#fff' }}>{oppFranchise.ownerName || 'Bot'}</span>
                <div className="player-avatar" style={{ width: 42, height: 42, border: '2px solid var(--signal)', background: oppFranchise.color, fontSize: 22 }}>{oppFranchise.logo}</div>
              </div>
              <div className="score-value">{oppRuns} / {oppWkts}</div>
            </div>
          </div>
        </div>

        <img src={leftHandImg} alt="Your hand" className="match-hand left" />
        <img src={rightHandImg} alt="Opponent hand" className="match-hand right" />
        <div className="match-vs">VS</div>

        <div className="match-bottombar">
          <div className="keypad-wrap">
            <div className="keypad-track"><div className="keypad-track-fill" style={{ width: `${trackPct}%` }} /></div>
            <div className="keypad-timer">{secondsLeft}s</div>
            <div className="keypad-grid">
              {[1, 2, 3, 4, 5, 6].map(n => {
                const active = userChoiceSelected === n;
                return (
                  <button key={n}
                    className={`keypad-btn-img ${active ? 'active' : ''}`}
                    onClick={() => handleChoice(n)}
                    disabled={isPaused || !!userChoiceSelected}
                  >
                    <img src={`/img/${n}.png`} alt={`Choice ${n}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="status-pill">{isUserBatting ? 'You are batting!' : 'You are bowling!'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ padding: '16px 22px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="live-dot" />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, color: 'var(--text-0)' }}>{currentRoundObj.name}</h2>
            <span className="badge badge-signal" style={{ fontSize: 10 }}>SIMULTANEOUS</span>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 2 }}>All matches in this round tick at the same time</p>
        </div>
        {isPaused && <div className="badge badge-signal" style={{ fontSize: 12, padding: '6px 14px' }}><PauseCircle size={14} /> PAUSED</div>}
      </div>

      <div className="grid-auto-fill" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {currentRoundObj.matches.map(match => {
          const t1 = teams.find(t => t.id === match.team1Id);
          const t2 = teams.find(t => t.id === match.team2Id);
          const isUserMatch = match.team1Id === userTeamId || match.team2Id === userTeamId;

          return (
            <div key={match.id} className="card match-grid-card" style={{
              border: isUserMatch ? '2px solid var(--signal-line)' : undefined,
              boxShadow: match.status === 'LIVE' ? '0 0 20px rgba(56, 189, 248, 0.1)' : undefined,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{match.name || 'Group stage'}</span>
                {match.status === 'LIVE' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="live-dot" /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--live-red)' }}>LIVE</span></div>
                ) : match.status === 'COMPLETED' ? (
                  <span className="badge badge-win" style={{ fontSize: 10 }}>FINISHED</span>
                ) : (
                  <span className="badge badge-muted" style={{ fontSize: 10 }}>SCHEDULED</span>
                )}
              </div>

              {[{ team: t1, runs: match.runs1, wkts: match.wickets1, overs: match.overs1 },
                { team: t2, runs: match.runs2, wkts: match.wickets2, overs: match.overs2 }].map(({ team, runs, wkts, overs }, i) => (
                <div key={i} className={`match-row ${match.battingTeamId === team.id ? 'is-batting' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 20 }}>{team.logo}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-0)' }}>{team.shortName}</span>
                        {match.battingTeamId === team.id && (
                          <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--signal)', color: 'var(--text-on-live)', padding: '1px 6px', borderRadius: 4 }}>BAT</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {team.ownerName || 'AI bot'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20, color: 'var(--text-0)' }}>{runs}/{wkts}</span>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>({overs.toFixed(1)} ov)</div>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 12, background: 'var(--ink-1)', border: '1px solid var(--line-1)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                {match.target && match.status === 'LIVE' && (
                  <span style={{ color: 'var(--info-cyan)', fontStyle: 'normal', fontWeight: 600, marginRight: 8 }}>
                    Need {match.target - match.runs2} off {room.overs * 6 - match.balls2}b •
                  </span>
                )}
                <span>{match.commentary[0] || 'Awaiting ball…'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
