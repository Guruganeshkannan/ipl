import React, { useState } from 'react';
import { Plus, ArrowRight, Play, Cpu, UserCheck, X, Settings2 } from 'lucide-react';

const AI_MODES = [
  { value: 'passive', label: 'Passive AI' },
  { value: 'balanced', label: 'Balanced AI' },
  { value: 'aggressive', label: 'Aggressive AI' },
];

export default function LobbyView({ room, catalog, isHost, hostTeamId, playerName, onSetPlayerName, joinError, onCreateRoom, onJoinRoom, onStartAuction, onRemoveTeam, onAddTeam, onSetTeamAi, onSetRoomConfig, userTeamId }) {
  const [inputCode, setInputCode] = useState('');
  const [overs, setOvers] = useState(2);
  const [squadLimit, setSquadLimit] = useState(7);
  const [showConfig, setShowConfig] = useState(false);
  const [nameInput, setNameInput] = useState(playerName || '');

  const effectiveName = () => nameInput.trim();
  const hasName = nameInput.trim().length > 0;

  if (!room) {
    return (
      <div>
        <div className="lobby-hero">
          <div className="badge badge-signal" style={{ display: 'inline-flex' }}>🏏 MULTIPLAYER HAND CRICKET</div>
          <h1>Build your dream XI.<br /><span className="accent">Win the IPL.</span></h1>
          <p>Create a persistent room, auction real IPL stars, and compete in
             simultaneous hand-cricket matches across as many franchises as you like.</p>
        </div>

        <div style={{ maxWidth: 420, margin: '0 auto 24px' }}>
          <label className="label">Your name</label>
          <input
            className="input-field"
            placeholder="How should we show your name?"
            value={nameInput}
            maxLength={24}
            onChange={e => { setNameInput(e.target.value); onSetPlayerName(e.target.value); }}
          />
          {!hasName && (
            <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 6 }}>Enter your name to create or join a room.</p>
          )}
        </div>

        <div className="lobby-cards">
          <div className="card" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div className="lobby-card-icon" style={{ background: 'var(--signal-dim)', border: '1px solid var(--signal-line)', color: 'var(--signal)' }}>
                  <Plus size={19} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, color: 'var(--text-0)' }}>Host new room</h2>
              </div>
              <p style={{ color: 'var(--text-3)', fontSize: 13, marginLeft: 50 }}>Configure and share the room code with friends</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              <div>
                <label className="label">Overs per innings</label>
                <select className="input-field" value={overs} onChange={e => setOvers(Number(e.target.value))}>
                  <option value={2}>2 overs — Blitz mode</option>
                  <option value={5}>5 overs — Classic T5</option>
                  <option value={10}>10 overs — Full match</option>
                </select>
              </div>
              <div>
                <label className="label">Squad size</label>
                <select className="input-field" value={squadLimit} onChange={e => setSquadLimit(Number(e.target.value))}>
                  <option value={7}>7 players per team</option>
                  <option value={11}>11 players per team</option>
                </select>
              </div>
              <p style={{ color: 'var(--text-3)', fontSize: 12 }}>You can remove franchises and tune AI once inside the room.</p>
            </div>

            <button
              className="btn btn-signal btn-lg"
              style={{ width: '100%' }}
              onClick={() => onCreateRoom(overs, squadLimit)}
              disabled={!hasName}
              title={hasName ? '' : 'Enter your name first'}
            >
              Create room
            </button>
          </div>

          <div className="card" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div className="lobby-card-icon" style={{ background: 'var(--info-cyan-dim)', border: '1px solid rgba(56,189,248,0.4)', color: 'var(--info-cyan)' }}>
                  <ArrowRight size={19} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, color: 'var(--text-0)' }}>Join a room</h2>
              </div>
              <p style={{ color: 'var(--text-3)', fontSize: 13, marginLeft: 50 }}>Enter the code from your host</p>
            </div>

            <div style={{ flex: 1 }}>
              <label className="label">Room code</label>
              <input
                className="input-field"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, textAlign: 'center', letterSpacing: 5, borderColor: joinError ? 'var(--live-red)' : undefined }}
                placeholder="ABC123"
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
              {joinError && (
                <p style={{ color: 'var(--live-red)', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{joinError}</p>
              )}
            </div>

            <button
              className="btn btn-lg"
              style={{ width: '100%', background: 'var(--info-cyan)', color: '#04202b' }}
              onClick={() => inputCode && hasName && onJoinRoom(inputCode, null, effectiveName())}
              disabled={!inputCode || !hasName}
              title={!hasName ? 'Enter your name first' : ''}
            >
              Join room
            </button>
          </div>
        </div>
      </div>
    );
  }

  const allTeamIds = new Set(room.teams.map(t => t.id));
  const removableTeams = catalog?.teams?.filter(t => !allTeamIds.has(t.id)) || [];

  return (
    <div className="page-wrap">
      <div className="card" style={{ padding: '20px 26px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 21, color: 'var(--text-0)', marginBottom: 2 }}>
            Pick your IPL franchise
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
            {room.teams.length} franchises in this room · empty slots are filled by AI when the auction starts
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input-field"
            style={{ width: 160, maxWidth: '100%', flex: '1 1 140px' }}
            placeholder="Your name"
            value={nameInput}
            maxLength={24}
            onChange={e => { setNameInput(e.target.value); onSetPlayerName(e.target.value); }}
          />
          {isHost && (
            <button className="btn btn-ghost" onClick={() => setShowConfig(v => !v)}>
              <Settings2 size={16} /> Room settings
            </button>
          )}
          <button
            className="btn btn-signal btn-lg"
            onClick={onStartAuction}
            disabled={!isHost}
            title={isHost ? '' : 'Only the host can start the auction'}
          >
            <Play size={17} style={{ fill: 'currentColor' }} /> Start auction
          </button>
        </div>
      </div>
      {!isHost && (
        <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: -16, marginBottom: 20, textAlign: 'right' }}>
          Waiting for the host to start the auction
        </p>
      )}

      {isHost && showConfig && (
        <div className="card" style={{ padding: '18px 26px', marginBottom: 24 }}>
          <div className="config-row">
            <div className="config-field">
              <label className="label">Overs per innings</label>
              <select className="input-field" defaultValue={room.overs} onChange={e => onSetRoomConfig({ overs: Number(e.target.value) })}>
                <option value={2}>2 overs</option>
                <option value={5}>5 overs</option>
                <option value={10}>10 overs</option>
              </select>
            </div>
            <div className="config-field">
              <label className="label">Squad size</label>
              <select className="input-field" defaultValue={room.maxSquadSize} onChange={e => onSetRoomConfig({ maxSquadSize: Number(e.target.value) })}>
                <option value={7}>7 players</option>
                <option value={11}>11 players</option>
                <option value={15}>15 players</option>
              </select>
            </div>
            <div className="config-field">
              <label className="label">Difficulty</label>
              <select className="input-field" defaultValue={room.difficulty} onChange={e => onSetRoomConfig({ difficulty: e.target.value })}>
                <option value="easy">Easy AI</option>
                <option value="normal">Normal AI</option>
                <option value="hard">Hard AI</option>
              </select>
            </div>
            {removableTeams.length > 0 && (
              <div className="config-field">
                <label className="label">Add franchise back</label>
                <select className="input-field" defaultValue="" onChange={e => { if (e.target.value) { onAddTeam(e.target.value); e.target.value = ''; } }}>
                  <option value="" disabled>Select franchise…</option>
                  {removableTeams.map(t => <option key={t.id} value={t.id}>{t.logo} {t.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="team-grid">
        {room.teams.map(team => {
          const isUser = team.id === userTeamId;
          const isOccupied = !!team.ownerSocketId;

          return (
            <div key={team.id} className="card team-card" style={{
              borderTop: `3px solid ${team.color}`,
              boxShadow: isUser ? `0 0 20px ${team.color}30, inset 0 0 40px ${team.color}08` : undefined,
            }}>
              {isHost && !isOccupied && room.teams.length > 2 && (
                <button className="team-card-remove" title="Remove franchise" onClick={() => onRemoveTeam(team.id)}>
                  <X size={13} />
                </button>
              )}

              <div style={{ fontSize: 34 }}>{team.logo}</div>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19, color: 'var(--text-0)' }}>{team.shortName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{team.name}</div>
              </div>

              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {isOccupied ? (
                  <span className="badge badge-win"><UserCheck size={12} /> {team.ownerName}</span>
                ) : (
                  <span className="badge badge-muted"><Cpu size={12} /> AI bot</span>
                )}
                {team.id === hostTeamId && <span className="badge badge-signal">HOST</span>}
              </div>

              {isHost && isOccupied && (
                <select className="ai-mode-select" value={team.aiMode === 'off' ? 'off' : team.aiMode}
                  onChange={e => onSetTeamAi(team.id, e.target.value)}>
                  <option value="off">No AI assist</option>
                  {AI_MODES.map(m => <option key={m.value} value={m.value}>{m.label} (if you leave)</option>)}
                </select>
              )}
              {isHost && !isOccupied && (
                <select className="ai-mode-select" value={team.aiMode} onChange={e => onSetTeamAi(team.id, e.target.value)}>
                  {AI_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              )}

              <button
                className={`btn btn-sm ${isUser ? 'btn-signal' : 'btn-ghost'}`}
                style={{ width: '100%', marginTop: 'auto' }}
                onClick={() => onJoinRoom(room.code, team.id, effectiveName())}
                disabled={isUser || (isOccupied && !isUser)}
              >
                {isUser ? 'Your team' : isOccupied ? 'Taken' : 'Claim'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
