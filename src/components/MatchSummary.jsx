import React from 'react';

function topPerformers(match, teamId, statKey, limit) {
  return Object.values(match.playerStats)
    .filter(s => s.teamId === teamId && (statKey === 'runs' ? s.ballsFaced > 0 : s.ballsBowled > 0))
    .sort((a, b) => b[statKey] - a[statKey])
    .slice(0, limit);
}

function InningsBlock({ team, runs, wickets, overs, battersOf, bowlersOf }) {
  return (
    <div className="summary-innings">
      <div className="summary-innings-header" style={{ background: team.color }}>
        <span className="summary-team-name">{team.logo} {team.shortName}</span>
        <span className="summary-overs">{overs.toFixed(1)} ov</span>
        <span className="summary-score">{runs}-{wickets}</span>
      </div>
      <div className="summary-cols">
        <div className="summary-col">
          {battersOf.length === 0 && <div className="summary-row-empty">—</div>}
          {battersOf.map(p => (
            <div key={p.playerId} className="summary-row">
              <span className="summary-name">{p.name}{p.out ? '' : '*'}</span>
              <span className="summary-value bat">{p.runs}</span>
            </div>
          ))}
        </div>
        <div className="summary-col">
          {bowlersOf.length === 0 && <div className="summary-row-empty">—</div>}
          {bowlersOf.map(p => (
            <div key={p.playerId} className="summary-row">
              <span className="summary-name">{p.name}</span>
              <span className="summary-value bowl">{p.wickets}-{p.runsConceded}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MatchSummary({ match, teams, onClose }) {
  const t1 = teams.find(t => t.id === match.team1Id);
  const t2 = teams.find(t => t.id === match.team2Id);
  if (!t1 || !t2) return null;

  const winner = teams.find(t => t.id === match.winnerId);
  const resultText = !match.winnerId ? 'Match tied' :
    match.winnerId === match.battingTeamId
      ? `${winner.name} won by ${match.maxWickets - match.wickets2} wicket${match.maxWickets - match.wickets2 === 1 ? '' : 's'}`
      : `${winner.name} won by ${match.runs1 - match.runs2} run${match.runs1 - match.runs2 === 1 ? '' : 's'}`;

  return (
    <div className="summary-backdrop" onClick={onClose}>
      <div className="summary-card" onClick={e => e.stopPropagation()}>
        <div className="summary-title-bar">
          <span className="eyebrow">MATCH SUMMARY</span>
          <span className="summary-subtitle">{match.name || 'League stage'}</span>
        </div>

        {/* runs1/wickets1 belong to whoever the toss sent in to bat first,
            which is not always team1 - pair blocks by firstInningsBattingTeamId. */}
        {(() => {
          const t1BattedFirst = match.firstInningsBattingTeamId === match.team1Id;
          const firstTeam = t1BattedFirst ? t1 : t2;
          const secondTeam = t1BattedFirst ? t2 : t1;
          return (
            <>
              <InningsBlock
                team={firstTeam} runs={match.runs1} wickets={match.wickets1} overs={match.overs1}
                battersOf={topPerformers(match, firstTeam.id, 'runs', 3)}
                bowlersOf={topPerformers(match, secondTeam.id, 'wickets', 3)}
              />
              <InningsBlock
                team={secondTeam} runs={match.runs2} wickets={match.wickets2} overs={match.overs2}
                battersOf={topPerformers(match, secondTeam.id, 'runs', 3)}
                bowlersOf={topPerformers(match, firstTeam.id, 'wickets', 3)}
              />
            </>
          );
        })()}

        <div className="summary-result-bar">{resultText}</div>

        {onClose && <button className="btn btn-ghost btn-sm" style={{ margin: '14px auto 0', display: 'flex' }} onClick={onClose}>Close</button>}
      </div>
    </div>
  );
}
