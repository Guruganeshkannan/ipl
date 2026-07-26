import React from 'react';
import { Trophy, CheckCircle2, Hourglass } from 'lucide-react';

export default function PreMatchView({ room, userTeamId, onReady }) {
  const { pointsTable, structure, rounds, currentRound } = room.tournament;
  const userTeam = room.teams.find(t => t.id === userTeamId);
  const isReady = userTeam ? !!userTeam.readyForMatches : true;
  const humanTeams = room.teams.filter(t => !t.isAi);
  const waitingOn = humanTeams.filter(t => !t.readyForMatches);

  const firstRound = rounds?.[currentRound] || rounds?.[0];

  return (
    <div className="page-wrap">
      <div className="card" style={{ padding: 26, marginBottom: 20, textAlign: 'center' }}>
        <div className="badge badge-signal" style={{ display: 'inline-flex', marginBottom: 10 }}>
          <Trophy size={12} /> AUCTION COMPLETE
        </div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 22, color: 'var(--text-0)' }}>
          Squads are set. Here's the season ahead.
        </h2>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          {structure === 'IPL4' ? 'Top 4 advance to Qualifier/Eliminator, then the Final.' :
           structure === 'FINAL' ? 'Top 2 meet in the Grand Final.' : 'League winner takes the trophy.'}
        </p>
      </div>

      <div className="prematch-grid">
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text-0)', marginBottom: 14 }}>Franchises</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="ipl-table">
              <thead>
                <tr><th style={{ width: 36 }}>#</th><th>Team</th><th style={{ textAlign: 'center' }}>Owner</th><th style={{ textAlign: 'center' }}>Purse left</th></tr>
              </thead>
              <tbody>
                {pointsTable.map((row, idx) => {
                  const team = room.teams.find(t => t.id === row.teamId);
                  const isUser = row.teamId === userTeamId;
                  return (
                    <tr key={row.teamId} className={isUser ? 'row-user' : ''}>
                      <td>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{team?.logo}</span>
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-0)' }}>{team?.shortName}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-2)' }}>{team?.ownerName || 'AI bot'}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--win-green)' }}>₹{team?.purse.toFixed(2)} Cr</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text-0)', marginBottom: 14 }}>
            {firstRound?.name || 'Fixtures'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(firstRound?.matches || []).map(m => {
              const t1 = room.teams.find(t => t.id === m.team1Id);
              const t2 = room.teams.find(t => t.id === m.team2Id);
              const isUserMatch = m.team1Id === userTeamId || m.team2Id === userTeamId;
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  background: isUserMatch ? 'var(--signal-dim)' : 'var(--ink-1)',
                  border: `1px solid ${isUserMatch ? 'var(--signal-line)' : 'var(--line-1)'}`
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t1?.logo} {t1?.shortName}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>vs</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t2?.shortName} {t2?.logo}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20, textAlign: 'center' }}>
        {userTeam ? (
          isReady ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--win-green)' }}>
              <CheckCircle2 size={20} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>You're ready — waiting for other players…</span>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 14 }}>Take a look at your squad and the bracket, then hit Play when you're ready to start Round 1.</p>
              <button className="btn btn-signal btn-lg" onClick={onReady}>Play</button>
            </>
          )
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-2)' }}>
            <Hourglass size={18} />
            <span>Spectating — waiting for players to ready up…</span>
          </div>
        )}
        {waitingOn.length > 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 12 }}>
            Waiting on: {waitingOn.map(t => t.shortName).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
