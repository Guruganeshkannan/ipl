import express from 'express';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRooms, saveRooms } from './storage.js';
import { roomManager } from './RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const storedRooms = loadRooms();
roomManager.init(storedRooms);
console.log(`Loaded ${Object.keys(roomManager.rooms).length} rooms from disk persistence.`);

// Debounced disk save — coalesces the many broadcasts-per-second into
// one write every SAVE_INTERVAL_MS.
const SAVE_INTERVAL_MS = 5000;
let saveTimer = null;
let savePending = false;
function scheduleSave() {
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (savePending) {
      savePending = false;
      saveRooms(roomManager.rooms);
    }
  }, SAVE_INTERVAL_MS);
}
function flushSaveNow() {
  saveRooms(roomManager.rooms);
}

// A page refresh (or a momentary network blip) always disconnects the old
// socket before the new one reconnects. Destroying a room the instant its
// last human socket disconnects means every solo-player refresh wipes the
// room out from under them. Give reconnects a grace window instead.
const DESTROY_GRACE_MS = 15000;
const pendingDestroys = new Map(); // roomCode -> setTimeout handle

function cancelPendingDestroy(roomCode) {
  const handle = pendingDestroys.get(roomCode);
  if (handle) {
    clearTimeout(handle);
    pendingDestroys.delete(roomCode);
  }
}

function scheduleDestroyIfEmpty(roomCode) {
  cancelPendingDestroy(roomCode);
  const handle = setTimeout(() => {
    pendingDestroys.delete(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const hasHumans = room.teams.some(t => !t.isAi);
    if (!hasHumans) {
      console.log(`Room ${roomCode} still has no human players after grace period. Destroying room.`);
      delete roomManager.rooms[roomCode];
      flushSaveNow();
    }
  }, DESTROY_GRACE_MS);
  pendingDestroys.set(roomCode, handle);
}

function broadcastRoom(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (room) {
    room.touch();
    io.to(roomCode).emit('roomUpdated', room.toClientState());
    scheduleSave();
  }
}

// socketId -> { roomCode, teamId } for teams the socket has claimed.
// Populated on claim/join, cleared on leave/disconnect.
function authTeam(socket, roomCode, teamId) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return null;
  const team = room.teams.find(t => t.id === teamId);
  if (!team || team.ownerSocketId !== socket.id) return null;
  return { room, team };
}

function requireHost(socket, roomCode, hostToken) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return null;
  const authorized = room.adminSocketId === socket.id || (hostToken && room.hostToken === hostToken);
  if (!authorized) return null;
  if (room.adminSocketId !== socket.id) room.adminSocketId = socket.id; // rebind on reconnect
  return room;
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('createRoom', ({ overs = 2, maxSquadSize = 7 } = {}, callback) => {
    const hostToken = crypto.randomUUID();
    const room = roomManager.createRoom(socket.id, { overs, maxSquadSize, hostToken });
    socket.join(room.code);
    if (callback) callback({ success: true, roomCode: room.code, hostToken, room: room.toClientState(), catalog: room.getStaticCatalog() });
    broadcastRoom(room.code);
  });

  socket.on('joinRoom', ({ roomCode, teamId, ownerName, hostToken }, callback) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      if (callback) callback({ success: false, message: 'Room not found' });
      return;
    }

    cancelPendingDestroy(roomCode);
    socket.join(roomCode);

    if (hostToken && room.hostToken === hostToken) {
      room.adminSocketId = socket.id;
    }

    let claimed = null;
    if (teamId) {
      claimed = room.claimTeam(teamId, socket.id, ownerName);
    }

    if (callback) {
      callback({
        success: true,
        room: room.toClientState(),
        catalog: room.getStaticCatalog(),
        isHost: room.adminSocketId === socket.id,
        claimedTeamId: claimed ? teamId : null,
        claimRejected: teamId ? !claimed : false
      });
    }
    broadcastRoom(roomCode);
  });

  socket.on('startAuction', ({ roomCode, hostToken }, callback) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (!room) { if (callback) callback({ ok: false, reason: 'NOT_AUTHORIZED' }); return; }
    if (room.status === 'LOBBY' || room.status === 'FINISHED') {
      room.startAuction();
      broadcastRoom(roomCode);
      if (callback) callback({ ok: true });
    } else if (callback) {
      callback({ ok: false, reason: 'WRONG_STATUS' });
    }
  });

  socket.on('placeBid', ({ roomCode, teamId }, callback) => {
    const auth = authTeam(socket, roomCode, teamId);
    if (!auth) { if (callback) callback({ ok: false, reason: 'NOT_AUTHORIZED' }); return; }
    const { room } = auth;
    if (room.status !== 'AUCTION') { if (callback) callback({ ok: false, reason: 'NOT_IN_AUCTION' }); return; }
    const result = room.placeBid(teamId);
    if (callback) callback(result);
    if (result.ok) broadcastRoom(roomCode);
  });

  socket.on('selectHandChoice', ({ roomCode, matchId, teamId, choice }) => {
    const auth = authTeam(socket, roomCode, teamId);
    if (!auth) return;
    const { room } = auth;
    if (room.status !== 'MATCHES') return;
    const roundObj = room.tournament.rounds[room.tournament.currentRound];
    if (!roundObj) return;
    const match = roundObj.matches.find(m => m.id === matchId);
    if (!match) return;
    if (teamId === match.team1Id) match.interactiveInput.team1Choice = choice;
    if (teamId === match.team2Id) match.interactiveInput.team2Choice = choice;
    broadcastRoom(roomCode);
  });

  socket.on('togglePauseRoom', ({ roomCode, hostToken }) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (room) {
      room.isPaused = !room.isPaused;
      broadcastRoom(roomCode);
    }
  });

  socket.on('resetRoom', ({ roomCode, hostToken }) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (room) {
      room.status = 'LOBBY';
      room.isPaused = false;
      room.teams.forEach(t => {
        t.squad = [];
        t.purse = room.purseLimit;
        t.strength = { bat: 50, bowl: 50 };
      });
      room.auction.phase = 'IDLE';
      room.auction.status = 'IDLE';
      room.tournament = { currentRound: 0, rounds: [], structure: null, pointsTable: [], winnerTeamId: null };
      broadcastRoom(roomCode);
    }
  });

  socket.on('removeTeam', ({ roomCode, teamId, hostToken }, callback) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (!room) { if (callback) callback({ ok: false, reason: 'NOT_AUTHORIZED' }); return; }
    const result = room.removeTeam(teamId);
    if (callback) callback(result);
    if (result.ok) broadcastRoom(roomCode);
  });

  socket.on('addTeam', ({ roomCode, teamId, hostToken }, callback) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (!room) { if (callback) callback({ ok: false, reason: 'NOT_AUTHORIZED' }); return; }
    const result = room.addTeam(teamId);
    if (callback) callback(result);
    if (result.ok) broadcastRoom(roomCode);
  });

  socket.on('setTeamAi', ({ roomCode, teamId, mode, hostToken }, callback) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (!room) { if (callback) callback({ ok: false, reason: 'NOT_AUTHORIZED' }); return; }
    const result = room.setTeamAi(teamId, mode);
    if (callback) callback(result);
    if (result.ok) broadcastRoom(roomCode);
  });

  socket.on('setRoomConfig', ({ roomCode, config, hostToken }, callback) => {
    const room = requireHost(socket, roomCode, hostToken);
    if (!room) { if (callback) callback({ ok: false, reason: 'NOT_AUTHORIZED' }); return; }
    const result = room.setRoomConfig(config || {});
    if (callback) callback(result);
    if (result.ok) broadcastRoom(roomCode);
  });

  socket.on('sendChat', ({ roomCode, teamId, message }) => {
    const room = roomManager.getRoom(roomCode);
    if (room && message && message.trim()) {
      const team = room.teams.find(t => t.id === teamId);
      const senderName = team ? (team.ownerName || team.shortName) : 'Observer';
      room.chat.push({
        id: Date.now().toString(),
        sender: senderName,
        teamId,
        message: message.trim(),
        timestamp: Date.now()
      });
      if (room.chat.length > 100) room.chat.shift();
      broadcastRoom(roomCode);
    }
  });

  socket.on('leaveRoom', ({ roomCode, teamId }) => {
    const room = roomManager.getRoom(roomCode);
    if (room && teamId) {
      const team = room.teams.find(t => t.id === teamId);
      if (team && team.ownerSocketId === socket.id) {
        team.isAi = true;
        team.ownerName = null;
        team.ownerSocketId = null;

        const hasHumans = room.teams.some(t => !t.isAi);
        if (!hasHumans) {
          console.log(`Room ${roomCode} has no human players. Destroying room.`);
          delete roomManager.rooms[roomCode];
          flushSaveNow();
        } else {
          broadcastRoom(roomCode);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    for (const [code, room] of Object.entries(roomManager.rooms)) {
      let roomChanged = false;
      room.teams.forEach(team => {
        if (team.ownerSocketId === socket.id) {
          team.isAi = true;
          team.ownerName = null;
          team.ownerSocketId = null;
          roomChanged = true;
        }
      });

      if (roomChanged) {
        const hasHumans = room.teams.some(t => !t.isAi);
        if (!hasHumans) {
          console.log(`Room ${code} has no human players after disconnect. Will destroy in ${DESTROY_GRACE_MS / 1000}s if nobody reconnects.`);
          scheduleDestroyIfEmpty(code);
        } else {
          broadcastRoom(code);
        }
      }
    }
  });
});

setInterval(() => {
  for (const [code, room] of Object.entries(roomManager.rooms)) {
    if (room.status === 'AUCTION') {
      room.tickAuction();
      broadcastRoom(code);
    } else if (room.status === 'MATCHES') {
      room.tickCricketEngine();
      broadcastRoom(code);
    }
  }
}, 1200);

app.get('*', (req, res) => {
  if (fs.existsSync(path.join(distPath, 'index.html'))) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    res.send('Backend Server is running on port 3001. Please build or run Vite dev client.');
  }
});

process.on('SIGINT', () => { flushSaveNow(); process.exit(0); });
process.on('SIGTERM', () => { flushSaveNow(); process.exit(0); });

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🏏 IPL Room & Hand Cricket Server running on http://localhost:${PORT}`);
});
