import React from 'react';
import { Trophy } from 'lucide-react';

export default function StandingsView({ room, userTeamId }) {
  if (!room || !room.tournament) return null;

  const { pointsTable, structure } = room.tournament;
  const qualifyCount = structure === 'IPL4' ? 4 : structure === 'FINAL' ? 2 : structure === 'NONE' ? 1 : 0;

  return (
    <div className="page-wrap">
      <div className="card" style={{ padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div className="lobby-card-icon" style={{ background: 'var(--signal-dim)', border: '1px solid var(--signal-line)', color: 'var(--signal)' }}>
            <Trophy size={18} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, color: 'var(--text-0)' }}>Points table</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {qualifyCount > 1 ? `Top ${qualifyCount} qualify for the playoff stage` : qualifyCount === 1 ? 'League winner takes the trophy' : 'Standings update as matches complete'}
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ipl-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Team</th>
                <th style={{ textAlign: 'center' }}>P</th>
                <th style={{ textAlign: 'center' }}>W</th>
                <th style={{ textAlign: 'center' }}>L</th>
                <th style={{ textAlign: 'center' }}>Pts</th>
                <th style={{ textAlign: 'center' }}>NRR</th>
              </tr>
            </thead>
            <tbody>
              {pointsTable.map((row, idx) => {
                const qualifies = idx < qualifyCount;
                const isUser = row.teamId === userTeamId;
                const rowClass = isUser ? 'row-user' : qualifies ? 'row-highlight' : '';

                return (
                  <tr key={row.teamId} className={rowClass}>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: 8,
                        background: qualifies ? 'var(--signal)' : 'var(--ink-3)',
                        color: qualifies ? 'var(--text-on-live)' : 'var(--text-3)',
                        fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 12,
                      }}>{idx + 1}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-0)' }}>{row.teamName}</span>
                        {qualifies && <span className="badge badge-signal" style={{ fontSize: 9 }}>QUALIFIED</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{row.played}</td>
                    <td style={{ textAlign: 'center', color: 'var(--win-green)', fontWeight: 700 }}>{row.won}</td>
                    <td style={{ textAlign: 'center', color: 'var(--live-red)', fontWeight: 700 }}>{row.lost}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 700, color: 'var(--signal)' }}>{row.points}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: row.nrr >= 0 ? 'var(--win-green)' : 'var(--live-red)' }}>
                      {row.nrr > 0 ? '+' : ''}{row.nrr.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
