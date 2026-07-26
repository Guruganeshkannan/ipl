# IPL Mega Room - Complete Handover Document

## 1. Project Overview
The **IPL Mega Room** is a full-stack real-time multiplayer game that combines a live IPL Mega Auction with a simulated Hand Cricket Tournament. Up to 10 players can join a room, claim a franchise, participate in a live bidding war to build their squads, and then seamlessly transition into a round-robin Hand Cricket tournament against each other to win the trophy.

## 2. Tech Stack & Architecture
- **Frontend**: React.js (via Vite)
- **Backend**: Node.js, Express.js, Socket.IO
- **Styling**: Vanilla CSS (`src/index.css`) with custom CSS Variables for theming.
- **Icons**: Lucide React
- **Avatars**: DiceBear API (Dynamic generation based on player names)
- **Persistence**: File-system based JSON storage (`rooms.json`).

The architecture follows a classic Client-Server model using WebSockets for low-latency state synchronization. The server acts as the authoritative source of truth, managing the game loop, timer ticks, and state mutations. The client strictly acts as a dumb renderer that emits intent (bids, choices, chat) and reacts to the broadcasted state.

## 3. Directory Structure
```text
/
├── server/
│   ├── index.js         # Entry point, Express app, Socket setup, 1.2s Game Loop
│   ├── RoomManager.js   # Core logic class handling state, auction, bots, and cricket ticks
│   ├── storage.js       # Disk persistence for rooms
│   └── data/
│       ├── players.json # Seed data for the auction pool (80+ players)
│       ├── teams.json   # Seed data for the 10 IPL franchises
│       └── rooms.json   # Auto-saved dynamic state of active rooms
├── src/
│   ├── main.jsx         # Vite entry
│   ├── App.jsx          # Root component, socket listener, phase router
│   ├── index.css        # Global styles, variables, immersive UI styling
│   └── components/
│       ├── Navbar.jsx        # Top navigation, phase-locked tabs, Exit controls
│       ├── LobbyView.jsx     # Room creation, joining, team claiming, kicking bots
│       ├── AuctionView.jsx   # Immersive bidding UI, Live Chat, Bot logic, Audio ticks
│       ├── MatchesView.jsx   # Immersive Hand Cricket UI, Image rendering, Scoreboards
│       └── StandingsView.jsx # Points table, NRR calculation, Trophy reveal
└── public/
    ├── img/             # User-provided hand cricket images (1.png - 6.png, closed.png)
    └── (various static bg assets)
```

## 4. Room Lifecycle (State Machine)
The core `room.status` dictates the entire flow of the application:
1. **LOBBY**: Players join, claim teams. Unclaimed teams remain as AI bots. Host starts the auction.
2. **AUCTION**: The bidding phase. Players are shown one by one. Timer ticks down. Highest bidder wins.
3. **MATCHES**: The Hand Cricket tournament. A Round-Robin schedule is generated. Matches tick simultaneously.
4. **FINISHED**: The tournament concludes. Standings are finalized, and the Trophy view is unlocked.

## 5. Core Systems Deep Dive

### 5.1 The Auction System (`AuctionView.jsx` & `RoomManager.js`)
- **Server Tick**: Runs inside `tickAuction()` every 1.2 seconds. Handles timer countdown, player transition, and checking if bids are valid.
- **AI Bidding Logic**: Bots (`isAi: true`) evaluate the current player's rating and will aggressively bid up to ~15% of their total budget if they deem the player valuable, ensuring human players can't buy superstars for cheap.
- **Immersive UI**: The frontend uses `position: fixed` to take over the screen. It integrates:
  - **DiceBear API**: Generates professional headshots dynamically.
  - **Web Audio API**: Plays beep countdowns at 3s, 2s, 1s without needing static MP3 files.
  - **Live Chat**: Socket-powered chat room isolated to the active room.
  - **Paused State**: Allows the host to freeze the timer while bidding remains active.

### 5.2 The Hand Cricket Engine (`MatchesView.jsx` & `RoomManager.js`)
- **Simultaneous Matches**: All matches in a round happen at the exact same time. The server loop calls `processMatchBall` on every LIVE match.
- **Input Resolution**: If a human player is involved, the engine waits for their `interactiveInput`. If no input is given, it waits. If it's a bot, it generates a random choice (1-6).
- **Visuals**: Uses the custom images (`/img/1.png` - `/img/6.png`) mapped to the keypad. The server temporarily caches `lastBatChoice` and `lastBowlChoice` so the client can visually flash the opponent's chosen hand for exactly 1.2 seconds before the next ball.
- **Match State**: Tracks runs, wickets, overs, commentary history, and calculates targets dynamically for the second innings.

### 5.3 Player Management & Networking
- **Socket Hooks**: `App.jsx` registers the main `roomUpdate` listener. Every time the server modifies state, it broadcasts the entire room object via `broadcastRoom(code)`.
- **Exit & Cleanup Strategy**: 
  - Players can click "Leave Room" from the Navbar or inside game views.
  - This emits `leaveRoom`, which wipes `ownerSocketId` and converts their team back to an AI bot instantly.
  - The server explicitly watches for `disconnect` events (e.g., closing the browser tab). It runs a sweep to find and relinquish any teams owned by the dead socket.
  - **Auto-Destruction**: If the server detects that `0` human players remain in a room after a leave/disconnect, it completely wipes the room from memory and disk to prevent memory leaks.

## 6. Known Features & Recent Polish
- **Security Check**: Navigation tabs (Auction, Matches) are strictly locked on the UI until the host progresses the room phase.
- **Auto-Fill**: If the auction ends and franchises haven't filled their 15-man squad, the server automatically distributes unsold base-price players to ensure valid teams for the cricket tournament.
- **Trophy View**: Unlocked at the end of the `STANDINGS` phase, displaying a cinematic glassmorphism celebration of the top team.

## 7. Starting the Application
```bash
# Terminal 1: Run the Backend
node server/index.js
# Runs on port 3001. Handles WebSockets.

# Terminal 2: Run the Frontend
npm run dev
# Vite runs on port 5173. Proxies API requests if needed.

# Build for Production
npm run build
```
