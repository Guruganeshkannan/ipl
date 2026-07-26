import React, { useState, useEffect } from 'react';
import { PauseCircle, LogOut } from 'lucide-react';
import MatchSummary from './MatchSummary';
import PlayerAvatar from './primitives/PlayerAvatar';

const MOVE_AUTO_PICK_TICKS = 15;
const ROLE_EMOJI = { Bowler: '🎳', 'Wicket-Keeper': '🧤', 'All-Rounder': '⚡', Batsman: '🏏' };

const BOWLER_PICK_WAIT_TICKS = 6;

function BowlerPicker({ match, team, cap, onSelect }) {
  const bowled = match.bowlerOversBowled[team.id] || {};
  const secondsLeft = Math.max(0, Math.ceil((BOWLER_PICK_WAIT_TICKS - (match.bowlerWaitTicks || 0)) * 1.2));
  return (
    <div className="picker-overlay">
      <div className="picker-card">
        <span className="eyebrow">SELECT YOUR BOWLER</span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: 'var(--text-0)', marginTop: 6 }}>
          Who bowls this over? <span style={{ color: 'var(--signal)', fontFamily: 'var(--font-mono)' }}>({secondsLeft}s)</span>
        </h3>
        <div className="picker-list">
          {team.squad.map(p => {
            const overs = bowled[p.id] || 0;
            const maxed = overs >= cap;
            return (
              <button key={p.id} className="picker-row" disabled={maxed} onClick={() => onSelect(p.id)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlayerAvatar player={p} size={28} teamColor={team.color} />
                  {p.name} <span style={{ opacity: 0.6 }}>{ROLE_EMOJI[p.role]}</span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{overs}/{cap} ov</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BatsmanPicker({ match, team, onSelect }) {
  const order = match.battingOrder[team.id] || [];
  const stats = match.playerStats;
  return (
    <div className="picker-overlay">
      <div className="picker-card">
        <span className="eyebrow">WICKET!</span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: 'var(--text-0)', marginTop: 6 }}>Who's coming in to bat?</h3>
        <div className="picker-list">
          {order.filter(id => !stats[id]?.out).map(id => {
            const p = team.squad.find(sp => sp.id === id);
            if (!p) return null;
            return (
              <button key={id} className="picker-row" onClick={() => onSelect(id)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PlayerAvatar player={p} size={28} teamColor={team.color} />
                  {p.name} <span style={{ opacity: 0.6 }}>{ROLE_EMOJI[p.role]}</span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--signal)' }}>{stats[id]?.runs || 0} runs</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CELEBRATION_CONFIG = {
  SIX: { label: '6', text: 'SIX!', emoji: '🚀', className: 'celebrate-six' },
  FOUR: { label: '4', text: 'FOUR!', emoji: '🔥', className: 'celebrate-four' },
  WICKET: { label: 'OUT', text: 'WICKET!', emoji: '🎯', className: 'celebrate-wicket' },
};

function Celebration({ type }) {
  const cfg = CELEBRATION_CONFIG[type];
  if (!cfg) return null;
  return (
    <div className={`celebration-overlay ${cfg.className}`}>
      <div className="celebration-burst">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="celebration-particle" style={{ '--i': i }}>{cfg.emoji}</span>
        ))}
      </div>
      <div className="celebration-text">{cfg.text}</div>
    </div>
  );
}

function TossScreen({ match, teams, userTeamId, onLeave, onSelectTossChoice }) {
  const tossWinner = teams.find(t => t.id === match.tossWinnerId);
  const battingTeam = teams.find(t => t.id === match.battingTeamId);
  const bowlingTeam = teams.find(t => t.id === match.bowlingTeamId);
  const isUserTossWinner = match.tossWinnerId === userTeamId;
  const awaitingChoice = match.status === 'TOSS' && !match.tossChoice;

  return (
    <div className="match-stage toss-stage">
      <button className="leave-game-btn match-leave-fab" onClick={onLeave}><LogOut size={15} /> <span>Leave game</span></button>
      <div className="toss-center">
        <span className="eyebrow">🪙 THE TOSS</span>
        {tossWinner ? (
          <>
            <h2 className="toss-heading">
              <span style={{ color: tossWinner.color }}>{tossWinner.logo} {tossWinner.name}</span> won the toss
            </h2>
            {awaitingChoice ? (
              isUserTossWinner ? (
                <>
                  <p className="toss-sub">What will you do?</p>
                  <div className="toss-choice-row">
                    <button className="btn btn-signal btn-lg" onClick={() => onSelectTossChoice(match.id, userTeamId, 'bat')}>🏏 Bat first</button>
                    <button className="btn btn-signal btn-lg" onClick={() => onSelectTossChoice(match.id, userTeamId, 'bowl')}>🎯 Bowl first</button>
                  </div>
                </>
              ) : (
                <p className="toss-sub">Waiting for {tossWinner.ownerName || `${tossWinner.shortName} AI`} to decide…</p>
              )
            ) : (
              <>
                <p className="toss-sub">
                  {tossWinner.shortName} chose to {match.tossChoice === 'bat' ? 'BAT' : 'BOWL'} first
                </p>
                <div className="toss-lineup">
                  <div className="toss-lineup-team">
                    <div className="badge badge-signal" style={{ marginBottom: 6 }}>BATTING</div>
                    <div style={{ fontSize: 30 }}>{battingTeam?.logo}</div>
                    <div className="toss-team-name" style={{ color: battingTeam?.color }}>{battingTeam?.name}</div>
                  </div>
                  <div className="toss-lineup-vs">VS</div>
                  <div className="toss-lineup-team">
                    <div className="badge badge-info" style={{ marginBottom: 6 }}>BOWLING</div>
                    <div style={{ fontSize: 30 }}>{bowlingTeam?.logo}</div>
                    <div className="toss-team-name" style={{ color: bowlingTeam?.color }}>{bowlingTeam?.name}</div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="toss-sub">Flipping the coin…</p>
        )}
      </div>
    </div>
  );
}

export default function MatchesView({ room, onSelectChoice, onLeave, userTeamId, onSelectBowler, onSelectNextBatsman, onSelectTossChoice }) {
  const [localChoice, setLocalChoice] = useState(null);
  const [dismissedSummaryId, setDismissedSummaryId] = useState(null);
  // 'closed' between balls, 'revealed' once the ball has resolved and the
  // hands show their numbers — resets to closed at the start of every ball.
  const [revealPhase, setRevealPhase] = useState('closed');
  const [oppShaking, setOppShaking] = useState(false);
  const [myShaking, setMyShaking] = useState(false);
  const [celebration, setCelebration] = useState(null); // 'SIX' | 'FOUR' | 'WICKET' | null

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
    setRevealPhase('revealed');
    // Snap back to closed fists shortly after reveal so the next ball starts
    // from a clean "closed hand" state instead of showing stale numbers.
    const t = setTimeout(() => setRevealPhase('closed'), 900);
    return () => clearTimeout(t);
  }, [userMatch?.lastBatChoice, userMatch?.lastBowlChoice, userMatch?.id]);

  // The opponent's hand only has something to shake for once we know they've
  // locked in a choice (their pending pick is masked to 'HIDDEN' by the
  // server, so this is the only signal we get before the ball resolves).
  const oppChoiceField = userMatch && userTeamId === userMatch.team1Id ? 'team2Choice' : 'team1Choice';
  const oppPending = userMatch?.interactiveInput?.[oppChoiceField];
  useEffect(() => {
    if (oppPending === 'HIDDEN') {
      setOppShaking(true);
      const t = setTimeout(() => setOppShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [oppPending]);

  // Fire the six/four/wicket celebration a beat after the hands reveal,
  // so it reads as "ball resolved, THEN celebrate" rather than everything
  // popping at once.
  useEffect(() => {
    if (!userMatch?.lastBallEvent) return;
    const showTimer = setTimeout(() => setCelebration(userMatch.lastBallEvent), 350);
    const hideTimer = setTimeout(() => setCelebration(null), 350 + 1400);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMatch?.lastBallSeq]);

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

  if (userMatch && (userMatch.status === 'TOSS' || userMatch.status === 'TOSS_RESULT')) {
    return <TossScreen match={userMatch} teams={teams} userTeamId={userTeamId} onLeave={onLeave} onSelectTossChoice={onSelectTossChoice} />;
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

    // Hand shows a closed fist until either you tap a number (your own hand
    // reveals immediately) or the ball resolves (revealPhase flips both
    // hands to their final numbers); it snaps back to closed for the next
    // ball a moment after resolution.
    const leftHandImg = userChoiceSelected
      ? `/img/${userChoiceSelected}.png`
      : (revealPhase === 'revealed' && userLastChoice) ? `/img/${userLastChoice}.png` : `/img/closed.png`;
    const rightHandImg = (revealPhase === 'revealed' && oppLastChoice) ? `/img/${oppLastChoice}.png` : `/img/closed.png`;

    const waitTicks = userMatch.waitTicks || 0;
    const secondsLeft = Math.max(0, Math.ceil((MOVE_AUTO_PICK_TICKS - waitTicks) * 1.2));
    const trackPct = Math.min(100, (waitTicks / MOVE_AUTO_PICK_TICKS) * 100);

    // While either side is waiting on a bowler/batsman pick, ball resolution
    // is paused server-side — disable the keypad too so taps don't pile up
    // silently and make the wait look like an unresponsive freeze.
    const blockedByPick = !!userMatch.awaitingBowlerFor || !!userMatch.awaitingBatsmanFor;

    const handleChoice = (n) => {
      if (userChoiceSelected || blockedByPick) return;
      setMyShaking(true);
      setTimeout(() => setMyShaking(false), 400);
      setLocalChoice(n);
      onSelectChoice(userMatch.id, userTeamId, n);
    };

    return (
      <div className="match-stage">
        {celebration && <Celebration type={celebration} />}
        <button className="leave-game-btn match-leave-fab" onClick={onLeave}><LogOut size={15} /> <span>Leave game</span></button>
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

          <div className="score-card">
            <div className="score-card-header">
              <span style={{ marginRight: 'auto', fontSize: 18 }}>{!isUserBatting ? '🏏' : '🔴'}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#fff' }}>{oppFranchise.ownerName || 'Bot'}</span>
              <div className="player-avatar" style={{ width: 42, height: 42, border: '2px solid var(--signal)', background: oppFranchise.color, fontSize: 22 }}>{oppFranchise.logo}</div>
            </div>
            <div className="score-value">{oppRuns} / {oppWkts}</div>
          </div>
        </div>

        <div className="match-hand-zone">
          <img src={leftHandImg} alt="Your hand" className={`match-hand left ${myShaking ? 'shaking' : ''}`} />
          <img src={rightHandImg} alt="Opponent hand" className={`match-hand right ${oppShaking ? 'shaking' : ''}`} />
          <div className="match-vs">VS</div>
        </div>

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
                    disabled={isPaused || !!userChoiceSelected || blockedByPick}
                  >
                    <img src={`/img/${n}.png`} alt={`Choice ${n}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="status-pill">
            {userMatch.awaitingBowlerFor && userMatch.awaitingBowlerFor !== userTeamId
              ? `⏳ Waiting for ${oppFranchise.shortName} to pick a bowler…`
              : userMatch.awaitingBatsmanFor && userMatch.awaitingBatsmanFor !== userTeamId
              ? `⏳ Waiting for ${oppFranchise.shortName} to send in the next batsman…`
              : isUserBatting ? 'You are batting!' : 'You are bowling!'}
          </div>
        </div>

        {userMatch.awaitingBowlerFor === userTeamId && (
          <BowlerPicker
            match={userMatch}
            team={userFranchise}
            cap={Math.max(1, Math.ceil(room.overs / 5))}
            onSelect={(playerId) => onSelectBowler(userMatch.id, userTeamId, playerId)}
          />
        )}
        {userMatch.awaitingBatsmanFor === userTeamId && (
          <BatsmanPicker
            match={userMatch}
            team={userFranchise}
            onSelect={(playerId) => onSelectNextBatsman(userMatch.id, userTeamId, playerId)}
          />
        )}
      </div>
    );
  }

  if (userMatch && userMatch.status === 'COMPLETED' && dismissedSummaryId !== userMatch.id) {
    return (
      <>
        <MatchSummary match={userMatch} teams={teams} onClose={() => setDismissedSummaryId(userMatch.id)} />
        <MatchesGrid room={room} currentRoundObj={currentRoundObj} teams={teams} isPaused={isPaused} userTeamId={userTeamId} />
      </>
    );
  }

  return <MatchesGrid room={room} currentRoundObj={currentRoundObj} teams={teams} isPaused={isPaused} userTeamId={userTeamId} />;
}

function MatchesGrid({ room, currentRoundObj, teams, isPaused, userTeamId }) {
  const [openSummaryId, setOpenSummaryId] = useState(null);
  const summaryMatch = openSummaryId ? currentRoundObj.matches.find(m => m.id === openSummaryId) : null;

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
            <div key={match.id} className="card match-grid-card"
              onClick={() => match.status === 'COMPLETED' && setOpenSummaryId(match.id)}
              style={{
                border: isUserMatch ? '2px solid var(--signal-line)' : undefined,
                boxShadow: match.status === 'LIVE' ? '0 0 20px rgba(56, 189, 248, 0.1)' : undefined,
                cursor: match.status === 'COMPLETED' ? 'pointer' : undefined,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{match.name || 'Group stage'}</span>
                {match.status === 'LIVE' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="live-dot" /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--live-red)' }}>LIVE</span></div>
                ) : match.status === 'COMPLETED' ? (
                  <span className="badge badge-win" style={{ fontSize: 10 }}>FINISHED</span>
                ) : match.status === 'TOSS' || match.status === 'TOSS_RESULT' ? (
                  <span className="badge badge-signal" style={{ fontSize: 10 }}>🪙 TOSS</span>
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
                <span>{match.status === 'COMPLETED' ? 'Tap for match summary' : (match.commentary[0] || 'Awaiting ball…')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {summaryMatch && <MatchSummary match={summaryMatch} teams={teams} onClose={() => setOpenSummaryId(null)} />}
    </div>
  );
}
