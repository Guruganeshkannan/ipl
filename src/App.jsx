import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar';
import LobbyView from './components/LobbyView';
import AuctionView from './components/AuctionView';
import MatchesView from './components/MatchesView';
import PreMatchView from './components/PreMatchView';
import StandingsView from './components/StandingsView';
import TrophyView from './components/TrophyView';

// In production the backend is a separately-hosted Node process (Render/Railway/etc) —
// Vercel only serves the static frontend, which cannot run the Socket.IO/game-loop
// server. VITE_SERVER_URL points at that backend; unset in local dev, where the
// same-origin default is correct (server/index.js serves the built frontend too).
// transports: ['websocket'] must match the server config — some hosts
// (Render's free tier included) don't guarantee sticky sessions across the
// default HTTP long-polling handshake, which manifests as repeated 400s.
const socket = io(import.meta.env.VITE_SERVER_URL || undefined, { transports: ['websocket'] });

function removeTeamErrorMessage(reason) {
  switch (reason) {
    case 'NOT_AUTHORIZED': return 'Only the host can remove a franchise.';
    case 'NOT_IN_LOBBY': return 'Franchises can only be removed before the auction starts.';
    case 'TEAM_CLAIMED': return 'Someone has already claimed that franchise — ask them to leave first.';
    case 'MIN_TEAMS': return 'A room needs at least 2 franchises.';
    default: return "Couldn't remove that franchise.";
  }
}

export default function App() {
  const [room, setRoom] = useState(null);
  const [catalog, setCatalog] = useState(null); // { players, teams } — sent once, not per tick
  const [activeTab, setActiveTab] = useState('LOBBY');
  const [userTeamId, setUserTeamId] = useState(localStorage.getItem('ipl_user_team') || null);
  const [isHost, setIsHost] = useState(false);
  const [playerName, setPlayerName] = useState(localStorage.getItem('ipl_player_name') || '');
  const [joinError, setJoinError] = useState(null);
  // A shared invite link looks like /?room=ABC123 — prefills the join box
  // in the lobby so tapping a WhatsApp link drops straight into "enter your
  // name and join" instead of asking people to retype the code.
  const [sharedRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room'));
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const playersById = useCallback((id) => catalog?.players?.find(p => p.id === id), [catalog]);

  const clearLocalRoom = useCallback(() => {
    setRoom(null);
    setUserTeamId(null);
    setIsHost(false);
    setActiveTab('LOBBY');
    localStorage.removeItem('ipl_room_code');
    localStorage.removeItem('ipl_user_team');
    localStorage.removeItem('ipl_host_token');
  }, []);

  useEffect(() => {
    socket.on('roomUpdated', (updatedRoom) => {
      setRoom(updatedRoom);
      const tab = activeTabRef.current;
      if (updatedRoom.status === 'AUCTION' && tab === 'LOBBY') setActiveTab('AUCTION');
      else if (updatedRoom.status === 'PRE_MATCH' && (tab === 'LOBBY' || tab === 'AUCTION')) setActiveTab('MATCHES');
      else if (updatedRoom.status === 'MATCHES' && (tab === 'LOBBY' || tab === 'AUCTION')) setActiveTab('MATCHES');
      else if (updatedRoom.status === 'FINISHED' && tab === 'MATCHES') setActiveTab('TROPHY');
    });

    const savedRoomCode = localStorage.getItem('ipl_room_code');
    const savedHostToken = localStorage.getItem('ipl_host_token');
    const savedPlayerName = localStorage.getItem('ipl_player_name');
    if (savedRoomCode) {
      socket.emit('joinRoom', { roomCode: savedRoomCode, teamId: userTeamId, ownerName: savedPlayerName || 'Player', hostToken: savedHostToken }, (res) => {
        if (res?.success) {
          setRoom(res.room);
          if (res.catalog) setCatalog(res.catalog);
          setIsHost(!!res.isHost);
          if (res.claimRejected) {
            // Someone else claimed this team while we were away.
            setUserTeamId(null);
            localStorage.removeItem('ipl_user_team');
          }
        } else {
          // Room is gone or the code is stale — don't keep stale host/team state around.
          clearLocalRoom();
        }
      });
    }

    if (sharedRoomCode) {
      // Strip the query param so refreshing/copying the URL later doesn't
      // keep re-suggesting a room the user may have already left.
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => { socket.off('roomUpdated'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateRoom = (overs, maxSquadSize) => {
    socket.emit('createRoom', { overs, maxSquadSize }, (res) => {
      if (res?.success) {
        setRoom(res.room);
        setCatalog(res.catalog);
        setIsHost(true);
        localStorage.setItem('ipl_room_code', res.roomCode);
        localStorage.setItem('ipl_host_token', res.hostToken);
      }
    });
  };

  const handleJoinRoom = (roomCode, teamId, ownerName) => {
    setJoinError(null);
    socket.emit('joinRoom', { roomCode, teamId, ownerName }, (res) => {
      if (res?.success) {
        setRoom(res.room);
        setCatalog(res.catalog);
        setIsHost(!!res.isHost);
        localStorage.setItem('ipl_room_code', roomCode);
        if (res.claimRejected) {
          alert('That franchise has already been claimed by someone else.');
        } else if (res.claimedTeamId) {
          setUserTeamId(res.claimedTeamId);
          localStorage.setItem('ipl_user_team', res.claimedTeamId);
        }
      } else {
        setJoinError(res?.message || "Couldn't join that room.");
      }
    });
  };

  const getHostToken = () => localStorage.getItem('ipl_host_token');

  const handleSetPlayerName = (name) => {
    setPlayerName(name);
    localStorage.setItem('ipl_player_name', name);
  };

  const handleStartAuction = () => {
    if (!room) return;
    socket.emit('startAuction', { roomCode: room.code, hostToken: getHostToken() }, (res) => {
      if (res && !res.ok) {
        alert(res.reason === 'NOT_AUTHORIZED' ? 'Only the host can start the auction.' : "Can't start the auction right now.");
        return;
      }
      setActiveTab('AUCTION');
    });
  };

  const handleRemoveTeam = (teamId) => {
    if (!room) return;
    socket.emit('removeTeam', { roomCode: room.code, teamId, hostToken: getHostToken() }, (res) => {
      if (res && !res.ok) {
        alert(removeTeamErrorMessage(res.reason));
      }
    });
  };

  const handleAddTeam = (teamId) => {
    if (room) socket.emit('addTeam', { roomCode: room.code, teamId, hostToken: getHostToken() });
  };

  const handleSetTeamAi = (teamId, mode) => {
    if (room) socket.emit('setTeamAi', { roomCode: room.code, teamId, mode, hostToken: getHostToken() });
  };

  const handleSetRoomConfig = (config) => {
    if (room) socket.emit('setRoomConfig', { roomCode: room.code, config, hostToken: getHostToken() });
  };

  const handlePlaceBid = (teamId, callback) => {
    if (room) socket.emit('placeBid', { roomCode: room.code, teamId }, callback);
  };

  const handleSelectChoice = (matchId, teamId, choice) => {
    if (room) socket.emit('selectHandChoice', { roomCode: room.code, matchId, teamId, choice });
  };

  const handleSelectTossChoice = (matchId, teamId, choice) => {
    if (room) socket.emit('selectTossChoice', { roomCode: room.code, matchId, teamId, choice });
  };

  const handleSelectBowler = (matchId, teamId, playerId) => {
    if (room) socket.emit('selectBowler', { roomCode: room.code, matchId, teamId, playerId });
  };

  const handleSelectNextBatsman = (matchId, teamId, playerId) => {
    if (room) socket.emit('selectNextBatsman', { roomCode: room.code, matchId, teamId, playerId });
  };

  const handleSetTeamReady = () => {
    if (room && userTeamId) socket.emit('setTeamReady', { roomCode: room.code, teamId: userTeamId });
  };

  const handleSkipPlayer = () => {
    if (room) socket.emit('skipCurrentPlayer', { roomCode: room.code, hostToken: getHostToken() });
  };

  const handleTogglePause = () => {
    if (room) socket.emit('togglePauseRoom', { roomCode: room.code, hostToken: getHostToken() });
  };

  const handleResetRoom = () => {
    if (room) { socket.emit('resetRoom', { roomCode: room.code, hostToken: getHostToken() }); setActiveTab('LOBBY'); }
  };

  const handleSendChat = (message) => {
    if (room && userTeamId) {
      socket.emit('sendChat', { roomCode: room.code, teamId: userTeamId, message });
    }
  };

  const handleLeave = useCallback(() => {
    if (room && userTeamId) socket.emit('leaveRoom', { roomCode: room.code, teamId: userTeamId });
    clearLocalRoom();
  }, [room, userTeamId, clearLocalRoom]);

  const roomRef = useRef(room);
  roomRef.current = room;
  const handleLeaveRef = useRef(handleLeave);
  handleLeaveRef.current = handleLeave;

  // Guard the browser Back/Forward buttons while a room is active: there's no
  // client-side routing, so without this, Back would exit the page entirely
  // and silently abandon the room instead of confirming first.
  useEffect(() => {
    if (!room) return;

    window.history.pushState({ iplRoomGuard: true }, '');

    const onPopState = () => {
      if (!roomRef.current) return;
      const leave = window.confirm('Leave this room?');
      if (leave) {
        handleLeaveRef.current();
      } else {
        window.history.pushState({ iplRoomGuard: true }, '');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [!!room]);

  const userTeam = room?.teams?.find(t => t.id === userTeamId);
  // The host may or may not have claimed a franchise; if they have, this lets
  // every client (not just the host's own browser) show who's running the room.
  const hostTeamId = room?.teams?.find(t => t.ownerSocketId && t.ownerSocketId === room.adminSocketId)?.id || null;

  return (
    <>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        room={room}
        isHost={!!isHost}
        onTogglePause={handleTogglePause}
        onResetRoom={handleResetRoom}
        userTeam={userTeam}
        onLeave={handleLeave}
      />
      <main style={{ paddingTop: 24 }}>
        {(!room || activeTab === 'LOBBY') && (
          <LobbyView
            room={room}
            catalog={catalog}
            isHost={!!isHost}
            hostTeamId={hostTeamId}
            playerName={playerName}
            onSetPlayerName={handleSetPlayerName}
            joinError={joinError}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onStartAuction={handleStartAuction}
            onRemoveTeam={handleRemoveTeam}
            onAddTeam={handleAddTeam}
            onSetTeamAi={handleSetTeamAi}
            onSetRoomConfig={handleSetRoomConfig}
            userTeamId={userTeamId}
            sharedRoomCode={sharedRoomCode}
          />
        )}
        {room && activeTab === 'AUCTION' && (
          <AuctionView room={room} playersById={playersById} onPlaceBid={handlePlaceBid} onSendChat={handleSendChat} onTogglePause={handleTogglePause} isHost={!!isHost} onLeave={handleLeave} userTeamId={userTeamId} onSkipPlayer={handleSkipPlayer} />
        )}
        {room && activeTab === 'MATCHES' && room.status === 'PRE_MATCH' && (
          <PreMatchView room={room} userTeamId={userTeamId} onReady={handleSetTeamReady} />
        )}
        {room && activeTab === 'MATCHES' && room.status !== 'PRE_MATCH' && (
          <MatchesView room={room} onSelectChoice={handleSelectChoice} onLeave={handleLeave} userTeamId={userTeamId} onSelectBowler={handleSelectBowler} onSelectNextBatsman={handleSelectNextBatsman} onSelectTossChoice={handleSelectTossChoice} />
        )}
        {room && activeTab === 'STANDINGS' && (
          <StandingsView room={room} userTeamId={userTeamId} />
        )}
        {room && activeTab === 'TROPHY' && (
          <TrophyView room={room} onResetRoom={handleResetRoom} isHost={!!isHost} />
        )}
      </main>
    </>
  );
}
