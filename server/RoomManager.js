import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load data files
const teamsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'teams.json'), 'utf-8'));
const rawPlayersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'players.json'), 'utf-8'));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TICK_MS = 1200;
const SOLD_HOLD_TICKS = 2;          // ~2.4s pause after a sale/unsold before advancing
const SET_INTRO_TICKS = 2;          // ~2.4s "set" title card between auction sets
const ACCEL_TIMER_START = 5;        // shorter clock in the accelerated round
const BASE_TIMER_START = 8;
const BID_RESET_TIMER = 6;
const MOVE_AUTO_PICK_TICKS = 15;    // ~18s of no input before auto-play
const BOWLER_PICK_WAIT_TICKS = 6;   // ~7.2s to pick a bowler before auto-pick — much simpler choice than a hand-cricket ball, so it should never make the match feel stalled
const TOSS_WAIT_TICKS = 10;         // ~12s for the toss-winning human to choose bat/bowl
const TOSS_RESULT_HOLD_TICKS = 3;   // ~3.6s showing who's batting/bowling before the first ball
const MARQUEE_RATING_FLOOR = 95;
const MARQUEE_MAX = 8;
const POOL_SIZE_MULTIPLIER = 1.6;   // pool ~= teams * squadSize * multiplier when auto-scaled

// valueMult/needBonus are gentle multipliers on top of the base rating price
// (see aiValuation) — kept small deliberately so bot valuations stay in a
// believable IPL band instead of compounding into absurd numbers.
const AI_PROFILES = {
  passive:    { valueMult: 0.75, aggression: 0.18, needBonus: 0.15, maxPurseShare: 0.16 },
  balanced:   { valueMult: 1.00, aggression: 0.35, needBonus: 0.25, maxPurseShare: 0.22 },
  aggressive: { valueMult: 1.25, aggression: 0.55, needBonus: 0.35, maxPurseShare: 0.30 },
  bargain:    { valueMult: 0.65, aggression: 0.40, needBonus: 0.45, maxPurseShare: 0.14 },
};
const DIFFICULTY_SCALE = { easy: 0.7, normal: 1.0, hard: 1.3 };
// Rating-to-price curve: rating 81 (weakest in the pool) -> ~1 Cr,
// rating 99 (best) -> ~15 Cr, exponential in between. This is the realistic
// IPL band the whole AI valuation is built from.
const RATING_FLOOR = 81;
const RATING_CEIL = 99;
const PRICE_AT_FLOOR = 1.0;
const PRICE_AT_CEIL = 15.0;
const ROLE_TARGET_SHARE = { Batsman: 0.30, Bowler: 0.30, 'All-Rounder': 0.25, 'Wicket-Keeper': 0.15 };

// Squad-skill-affects-outcome coefficients (Phase 9)
const SKILL_BOUNDARY_P = 0.10;   // chance to upgrade a surviving run, scaled by batTier
const SKILL_SAVE_P = 0.15;       // chance to survive a same-number collision, scaled by batTier
const SKILL_STEAL_P = 0.10;      // chance to steal a wicket on a near-miss, scaled by bowlTier

function round2(n) {
  return parseFloat(n.toFixed(2));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i + 1;
    r -= weights[i];
  }
  return weights.length;
}

function bidIncrement(current) {
  if (current < 5) return 0.25;
  if (current < 10) return 0.5;
  return 1.0;
}

function nextBidAmount(current, hasBidder) {
  return hasBidder ? round2(current + bidIncrement(current)) : round2(current);
}

// Slim a squad player for the wire (drop nothing meaningful, just a hook for future trimming)
function slimPlayer(p) {
  return p;
}

export class Room {
  constructor(data) {
    this.code = data.code;
    this.adminSocketId = data.adminSocketId || null;
    this.hostToken = data.hostToken || null;
    this.overs = data.overs || 2;
    this.maxSquadSize = data.maxSquadSize || 7;
    this.purseLimit = data.purseLimit || 100.0;
    this.minBasePrice = data.minBasePrice || 0.5;
    this.poolSize = data.poolSize || null; // null = auto-scale at auction start
    this.difficulty = data.difficulty || 'normal';
    this.status = data.status || 'LOBBY'; // LOBBY, AUCTION, PRE_MATCH, MATCHES, FINISHED
    this.isPaused = data.isPaused || false;
    this.chat = data.chat || [];
    this.updatedAt = data.updatedAt || Date.now();

    this.teams = data.teams || teamsData.map(t => ({
      ...t,
      ownerSocketId: null,
      ownerName: null,
      isAi: true,
      aiMode: 'balanced', // 'off' | 'passive' | 'balanced' | 'aggressive'
      purse: this.purseLimit,
      squad: [],
      strength: { bat: 50, bowl: 50 }
    }));

    this.auction = data.auction || {
      phase: 'IDLE', // IDLE, SET_INTRO, BIDDING, SOLD, UNSOLD, ACCELERATED, FINISHED
      status: 'IDLE', // legacy alias kept in sync for older client code paths
      sets: [],
      currentSetIndex: 0,
      currentIndexInSet: 0,
      currentPlayer: null,
      currentBid: 0,
      currentBidder: null,
      nextBid: 0,
      bidHistory: [],
      timer: BASE_TIMER_START,
      timerActive: false,
      holdTicks: 0,
      unsoldQueue: [],
      soldLog: [],
      remainingCount: 0
    };

    this.tournament = data.tournament || {
      currentRound: 0,
      rounds: [],
      structure: null,
      pointsTable: [],
      winnerTeamId: null,
      playerStats: {}
    };

    if ((data.status === 'MATCHES' || data.status === 'PRE_MATCH') && (!this.tournament.rounds || this.tournament.rounds.length === 0)) {
      this.generateSchedule();
    }
  }

  // Persistence — full fidelity
  toJSON() {
    return {
      code: this.code,
      adminSocketId: this.adminSocketId,
      hostToken: this.hostToken,
      overs: this.overs,
      maxSquadSize: this.maxSquadSize,
      purseLimit: this.purseLimit,
      minBasePrice: this.minBasePrice,
      poolSize: this.poolSize,
      difficulty: this.difficulty,
      status: this.status,
      isPaused: this.isPaused,
      chat: this.chat,
      updatedAt: this.updatedAt,
      teams: this.teams,
      auction: this.auction,
      tournament: this.tournament
    };
  }

  // One-time catalog (players + team metadata) — sent once on join, not every tick
  getStaticCatalog() {
    return {
      players: rawPlayersData,
      teams: teamsData
    };
  }

  // Broadcast payload — slim, sent every tick
  toClientState() {
    const auction = this.auction;
    const upcoming = this._upcomingPlayers(10);
    return {
      code: this.code,
      adminSocketId: this.adminSocketId,
      overs: this.overs,
      maxSquadSize: this.maxSquadSize,
      purseLimit: this.purseLimit,
      minBasePrice: this.minBasePrice,
      poolSize: this.poolSize,
      difficulty: this.difficulty,
      status: this.status,
      isPaused: this.isPaused,
      teams: this.teams.map(t => ({ ...t, squad: t.squad.map(slimPlayer) })),
      auction: {
        phase: auction.phase,
        status: auction.status,
        currentSetIndex: auction.currentSetIndex,
        currentSetName: auction.sets[auction.currentSetIndex]?.name || null,
        setProgress: {
          done: auction.currentIndexInSet,
          total: auction.sets[auction.currentSetIndex]?.playerIds.length || 0
        },
        currentPlayer: auction.currentPlayer,
        currentBid: auction.currentBid,
        currentBidder: auction.currentBidder,
        nextBid: auction.nextBid,
        bidHistory: auction.bidHistory.slice(-8),
        timer: auction.timer,
        timerActive: auction.timerActive,
        remainingCount: auction.remainingCount,
        upcomingPreview: upcoming,
        unsoldPreview: auction.unsoldQueue.map(id => this._findPlayer(id)).filter(Boolean)
      },
      tournament: {
        currentRound: this.tournament.currentRound,
        structure: this.tournament.structure,
        pointsTable: this.tournament.pointsTable,
        winnerTeamId: this.tournament.winnerTeamId,
        rounds: this.tournament.rounds.map(r => this._slimRound(r)),
        playerStats: Object.values(this.tournament.playerStats || {})
      },
      chat: this.chat.slice(-50)
    };
  }

  _upcomingPlayers(n) {
    const a = this.auction;
    const set = a.sets[a.currentSetIndex];
    if (!set) return [];
    const ids = set.playerIds.slice(a.currentIndexInSet + 1, a.currentIndexInSet + 1 + n);
    const idSet = new Set(ids);
    return rawPlayersData.filter(p => idSet.has(p.id))
      .sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
  }

  _slimRound(r) {
    return {
      ...r,
      matches: r.matches.map(m => ({
        ...m,
        commentary: m.commentary.slice(0, 6),
        // Mask pending choices so the opponent's pick can't be read off the wire
        // before the ball resolves (Phase 10 anti-cheat fix).
        interactiveInput: {
          team1Choice: m.interactiveInput.team1Choice != null ? 'HIDDEN' : null,
          team2Choice: m.interactiveInput.team2Choice != null ? 'HIDDEN' : null
        }
      }))
    };
  }

  touch() {
    this.updatedAt = Date.now();
  }

  // -------------------------------------------------------------------------
  // Team / lobby management
  // -------------------------------------------------------------------------
  // A socket may own at most one team. Claiming a new team releases any
  // team that socket already held (back to AI) so selection is always
  // single-select, and refuses if the target team is already claimed by
  // someone else.
  claimTeam(teamId, socketId, ownerName) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return false;
    if (team.ownerSocketId && team.ownerSocketId !== socketId) return false;
    if (team.ownerSocketId === socketId) return true; // already yours, no-op

    this.teams.forEach(t => {
      if (t.ownerSocketId === socketId) {
        t.ownerSocketId = null;
        t.ownerName = null;
        t.isAi = true;
      }
    });

    team.ownerSocketId = socketId;
    team.ownerName = ownerName || `Owner (${teamId})`;
    team.isAi = false;
    return true;
  }

  fillAiTeams() {
    this.teams.forEach(team => {
      if (!team.ownerSocketId) {
        team.isAi = true;
        team.ownerName = `${team.name} AI`;
        if (team.aiMode === 'off') team.aiMode = 'balanced';
      }
    });
  }

  removeTeam(teamId) {
    if (this.status !== 'LOBBY') return { ok: false, reason: 'NOT_IN_LOBBY' };
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return { ok: false, reason: 'NOT_FOUND' };
    if (team.ownerSocketId) return { ok: false, reason: 'TEAM_CLAIMED' };
    if (this.teams.length <= 2) return { ok: false, reason: 'MIN_TEAMS' };
    this.teams = this.teams.filter(t => t.id !== teamId);
    return { ok: true };
  }

  addTeam(teamId) {
    if (this.status !== 'LOBBY') return { ok: false, reason: 'NOT_IN_LOBBY' };
    if (this.teams.some(t => t.id === teamId)) return { ok: false, reason: 'ALREADY_PRESENT' };
    const base = teamsData.find(t => t.id === teamId);
    if (!base) return { ok: false, reason: 'NOT_FOUND' };
    this.teams.push({
      ...base,
      ownerSocketId: null,
      ownerName: null,
      isAi: true,
      aiMode: 'balanced',
      purse: this.purseLimit,
      squad: [],
      strength: { bat: 50, bowl: 50 }
    });
    return { ok: true };
  }

  setTeamAi(teamId, mode) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return { ok: false, reason: 'NOT_FOUND' };
    if (mode === 'off' && !team.ownerSocketId) {
      // An unclaimed team can't be "off" — it would field an empty squad and
      // never bid. Removing the franchise is the correct tool for that case.
      return { ok: false, reason: 'CANNOT_DISABLE_UNCLAIMED' };
    }
    if (!AI_PROFILES[mode] && mode !== 'off') return { ok: false, reason: 'INVALID_MODE' };
    team.aiMode = mode;
    return { ok: true };
  }

  setRoomConfig({ overs, maxSquadSize, poolSize, difficulty, purseLimit }) {
    if (this.status !== 'LOBBY') return { ok: false, reason: 'NOT_IN_LOBBY' };
    if (overs) this.overs = overs;
    if (maxSquadSize) this.maxSquadSize = maxSquadSize;
    if (poolSize !== undefined) this.poolSize = poolSize; // null = auto
    if (difficulty && DIFFICULTY_SCALE[difficulty]) this.difficulty = difficulty;
    if (purseLimit) {
      this.purseLimit = purseLimit;
      this.teams.forEach(t => { t.purse = purseLimit; });
    }
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Auction
  // -------------------------------------------------------------------------
  buildAuctionPool() {
    // Shuffle fresh every time an auction starts so the pool/marquee picks
    // (and therefore the whole auction order) differ from room to room and
    // from reset to reset, instead of always being the same rating-sorted list.
    let pool = shuffleArray(rawPlayersData);
    const targetSize = this.poolSize || Math.round(this.teams.length * this.maxSquadSize * POOL_SIZE_MULTIPLIER);
    if (targetSize < pool.length) {
      const marquee = pool.filter(p => p.rating >= MARQUEE_RATING_FLOOR)
        .sort((a, b) => b.rating - a.rating).slice(0, MARQUEE_MAX);
      const marqueeIds = new Set(marquee.map(p => p.id));
      const rest = pool.filter(p => !marqueeIds.has(p.id));

      // Role-balanced tail: proportionally fill remaining slots per role, highest rated first.
      const remainingSlots = Math.max(0, targetSize - marquee.length);
      const roles = Object.keys(ROLE_TARGET_SHARE);
      const byRole = {};
      roles.forEach(r => {
        byRole[r] = rest.filter(p => p.role === r).sort((a, b) => b.rating - a.rating);
      });
      const tail = [];
      roles.forEach(r => {
        const take = Math.round(ROLE_TARGET_SHARE[r] * remainingSlots);
        tail.push(...byRole[r].slice(0, take));
      });
      // Top up/trim to exact target size if rounding left a gap.
      const tailIds = new Set(tail.map(p => p.id));
      if (tail.length < remainingSlots) {
        const leftovers = rest.filter(p => !tailIds.has(p.id)).sort((a, b) => b.rating - a.rating);
        tail.push(...leftovers.slice(0, remainingSlots - tail.length));
      }
      pool = [...marquee, ...tail.slice(0, remainingSlots)];
    }
    return pool;
  }

  buildAuctionSets(pool) {
    const marqueeIds = pool.filter(p => p.rating >= MARQUEE_RATING_FLOOR)
      .sort((a, b) => b.rating - a.rating).slice(0, MARQUEE_MAX).map(p => p.id);
    const marqueeSet = new Set(marqueeIds);
    const rest = pool.filter(p => !marqueeSet.has(p.id));
    const byRole = role => shuffleArray(rest.filter(p => p.role === role)).map(p => p.id);

    return [
      { id: 'MARQUEE', name: 'Marquee Set', playerIds: marqueeIds },
      { id: 'BAT', name: 'Batsmen', playerIds: byRole('Batsman') },
      { id: 'ALL', name: 'All-Rounders', playerIds: byRole('All-Rounder') },
      { id: 'WK', name: 'Wicket-Keepers', playerIds: byRole('Wicket-Keeper') },
      { id: 'BOWL', name: 'Bowlers', playerIds: byRole('Bowler') },
    ].filter(s => s.playerIds.length > 0);
  }

  startAuction() {
    this.fillAiTeams();
    this.teams.forEach(t => { t.rtmCardsLeft = 0; });
    this.status = 'AUCTION';

    const pool = this.buildAuctionPool();
    this.auction.sets = this.buildAuctionSets(pool);
    this.auction.currentSetIndex = 0;
    this.auction.currentIndexInSet = -1;
    this.auction.unsoldQueue = [];
    this.auction.soldLog = [];
    this.auction.holdTicks = 0;
    this._recomputeRemainingCount();
    this.advanceAuctionCursor();
  }

  _findPlayer(id) {
    return rawPlayersData.find(p => p.id === id);
  }

  _recomputeRemainingCount() {
    const a = this.auction;
    let count = 0;
    for (let s = a.currentSetIndex; s < a.sets.length; s++) {
      const start = s === a.currentSetIndex ? a.currentIndexInSet + 1 : 0;
      count += Math.max(0, a.sets[s].playerIds.length - start);
    }
    a.remainingCount = count + (a.phase === 'ACCELERATED' ? 0 : a.unsoldQueue.length);
  }

  // Moves the cursor to the next player, across sets, into the accelerated
  // round, and finally into FINISHED. Replaces the old nextAuctionPlayer().
  advanceAuctionCursor() {
    const a = this.auction;

    if (a.phase === 'ACCELERATED' || a.currentAccelIndex !== undefined) {
      return this._advanceAccelerated();
    }

    const allSquadsFull = this.teams.every(t => t.squad.length >= this.maxSquadSize);
    if (allSquadsFull) return this._finishOrAccelerate();

    a.currentIndexInSet += 1;
    let set = a.sets[a.currentSetIndex];

    if (!set || a.currentIndexInSet >= set.playerIds.length) {
      a.currentSetIndex += 1;
      a.currentIndexInSet = 0;
      set = a.sets[a.currentSetIndex];
      if (!set) return this._finishOrAccelerate();
      // brief set-intro card
      a.phase = 'SET_INTRO';
      a.status = 'SET_INTRO';
      a.holdTicks = SET_INTRO_TICKS;
      a.currentPlayer = null;
      this._recomputeRemainingCount();
      return;
    }

    const playerId = set.playerIds[a.currentIndexInSet];
    const player = this._findPlayer(playerId);
    this._beginBiddingFor(player, BASE_TIMER_START);
  }

  _beginBiddingFor(player, timerStart) {
    const a = this.auction;
    a.currentPlayer = player;
    a.currentBid = player.basePrice;
    a.currentBidder = null;
    a.nextBid = nextBidAmount(player.basePrice, false);
    a.bidHistory = [];
    a.timer = timerStart;
    a.timerActive = true;
    a.phase = 'BIDDING';
    a.status = 'BIDDING';
    this._recomputeRemainingCount();
  }

  _finishOrAccelerate() {
    const a = this.auction;
    const teamsWithRoom = this.teams.some(t => t.squad.length < this.maxSquadSize);
    if (a.unsoldQueue.length > 0 && teamsWithRoom) {
      a.phase = 'ACCELERATED';
      a.status = 'BIDDING';
      a.currentAccelIndex = -1;
      this._advanceAccelerated();
    } else {
      this.finishAuction();
    }
  }

  _advanceAccelerated() {
    const a = this.auction;
    const allSquadsFull = this.teams.every(t => t.squad.length >= this.maxSquadSize);
    a.currentAccelIndex = (a.currentAccelIndex ?? -1) + 1;

    if (allSquadsFull || a.currentAccelIndex >= a.unsoldQueue.length) {
      return this.finishAuction();
    }

    const playerId = a.unsoldQueue[a.currentAccelIndex];
    const player = this._findPlayer(playerId);
    this._beginBiddingFor(player, ACCEL_TIMER_START);
    this._recomputeRemainingCount();
  }

  // -------------------------------------------------------------------------
  // Bidding
  // -------------------------------------------------------------------------
  maxBidFor(team) {
    const slotsLeft = this.maxSquadSize - team.squad.length;
    if (slotsLeft <= 0) return 0;
    return round2(team.purse - (slotsLeft - 1) * this.minBasePrice);
  }

  placeBid(teamId) {
    const a = this.auction;
    if (a.phase !== 'BIDDING' || !a.currentPlayer) return { ok: false, reason: 'NOT_BIDDING' };
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return { ok: false, reason: 'NOT_FOUND' };
    if (team.squad.length >= this.maxSquadSize) return { ok: false, reason: 'SQUAD_FULL' };
    if (a.currentBidder === teamId) return { ok: false, reason: 'ALREADY_HIGH' };

    const amount = nextBidAmount(a.currentBid, a.currentBidder !== null);
    if (amount > this.maxBidFor(team)) return { ok: false, reason: 'PURSE_RESERVE' };
    if (team.purse < amount) return { ok: false, reason: 'INSUFFICIENT_PURSE' };

    a.currentBid = amount;
    a.currentBidder = teamId;
    a.nextBid = nextBidAmount(amount, true);
    a.bidHistory.push({ teamId, amount, timestamp: Date.now() });
    a.timer = BID_RESET_TIMER;
    return { ok: true, amount };
  }

  // Resolves the player currently up for bidding — sold to the current
  // bidder if there is one, unsold otherwise — and opens the post-sale hold.
  // Shared by the timer running out and the admin Skip control, so both
  // paths stay in sync.
  _resolveCurrentPlayer() {
    const a = this.auction;
    if (a.currentBidder) {
      const winningTeam = this.teams.find(t => t.id === a.currentBidder);
      if (winningTeam) {
        winningTeam.purse = round2(winningTeam.purse - a.currentBid);
        winningTeam.squad.push({ ...a.currentPlayer, soldPrice: a.currentBid });
        this._recomputeTeamStrength(winningTeam);
        a.soldLog.push({ playerId: a.currentPlayer.id, teamId: winningTeam.id, price: a.currentBid });
      }
      a.phase = 'SOLD';
      a.status = 'SOLD';
    } else {
      a.phase = 'UNSOLD';
      a.status = 'UNSOLD';
      if (a.currentAccelIndex === undefined) {
        a.unsoldQueue.push(a.currentPlayer.id);
      }
    }
    a.timer = 0;
    a.timerActive = false;
    a.holdTicks = SOLD_HOLD_TICKS;
    this._recomputeRemainingCount();
  }

  // Admin-only: force the current player to resolve immediately (sold if
  // someone's bidding, unsold otherwise) instead of waiting out the timer.
  // Resolves directly rather than delegating to tickAuction(), since running
  // processAiBids() first could plant a fresh bid that resets the timer and
  // silently swallow the skip.
  skipCurrentPlayer() {
    const a = this.auction;
    if (a.phase !== 'BIDDING' || !a.currentPlayer) return { ok: false, reason: 'NOT_BIDDING' };
    this._resolveCurrentPlayer();
    return { ok: true };
  }

  tickAuction() {
    const a = this.auction;
    if (this.status !== 'AUCTION') return;

    if (a.holdTicks > 0) {
      if (this.isPaused) return;
      a.holdTicks -= 1;
      if (a.holdTicks === 0) this.advanceAuctionCursor();
      return;
    }

    if (a.phase !== 'BIDDING') return;

    if (this.isPaused) return; // bots and timer both freeze while paused

    this.processAiBids();

    if (a.timer > 0) {
      a.timer -= 1;
      return;
    }

    this._resolveCurrentPlayer();
  }

  // -------------------------------------------------------------------------
  // AI bidding
  // -------------------------------------------------------------------------
  // 0 = role slots already filled (low interest), 1 = still needs this role.
  squadNeed(team, role) {
    const want = Math.max(1, Math.round(ROLE_TARGET_SHARE[role] * this.maxSquadSize));
    const have = team.squad.filter(p => p.role === role).length;
    return have >= want ? 0 : 1;
  }

  // Realistic IPL-scale valuation: a rating-driven base price (~1 Cr for the
  // weakest player in the pool, ~15 Cr for the best), lightly adjusted by
  // squad need and AI personality, then hard-capped by purse. This keeps bot
  // bids in a band a human can realistically outbid, instead of every
  // player looking like a 20+ Cr superstar to every bot.
  aiValuation(team, player, profile) {
    const t = clamp((player.rating - RATING_FLOOR) / (RATING_CEIL - RATING_FLOOR), 0, 1);
    const base = PRICE_AT_FLOOR * Math.pow(PRICE_AT_CEIL / PRICE_AT_FLOOR, t);

    const need = this.squadNeed(team, player.role);
    const adjusted = base * profile.valueMult * (1 + need * profile.needBonus);

    const slotsLeft = this.maxSquadSize - team.squad.length;
    const scarcity = slotsLeft <= 2 ? 1.15 : 1.0;
    const cap = Math.min(
      this.maxBidFor(team),
      team.purse * profile.maxPurseShare * scarcity
    );
    return Math.min(round2(adjusted), cap);
  }

  processAiBids() {
    const a = this.auction;
    if (a.phase !== 'BIDDING' || !a.currentPlayer) return;
    const player = a.currentPlayer;
    const difficultyScale = DIFFICULTY_SCALE[this.difficulty] || 1.0;

    const eligible = this.teams.filter(t =>
      t.isAi && t.aiMode !== 'off' && t.squad.length < this.maxSquadSize && t.id !== a.currentBidder
    );

    for (const team of eligible) {
      const profile = AI_PROFILES[team.aiMode] || AI_PROFILES.balanced;
      const valuation = this.aiValuation(team, player, profile);
      const next = nextBidAmount(a.currentBid, a.currentBidder !== null);
      if (next > valuation) continue;
      if (next > this.maxBidFor(team)) continue;

      const headroom = (valuation - next) / Math.max(valuation, 0.01);
      const p = clamp(profile.aggression * (0.4 + 0.6 * headroom) * difficultyScale, 0, 0.95);
      if (Math.random() < p) {
        this.placeBid(team.id);
        break; // one AI bid per tick keeps the price ladder readable
      }
    }
  }

  _recomputeTeamStrength(team) {
    const s = team.squad;
    if (!s.length) { team.strength = { bat: 50, bowl: 50 }; return; }
    const topShare = arr => {
      const sorted = [...arr].sort((x, y) => y - x);
      const n = Math.max(1, Math.ceil(sorted.length * 0.6));
      return sorted.slice(0, n).reduce((sum, v) => sum + v, 0) / n;
    };
    team.strength = {
      bat: round2(topShare(s.map(p => p.battingSkill))),
      bowl: round2(topShare(s.map(p => p.bowlingSkill)))
    };
  }

  // Auto-fill squads with remaining unsold players at auction end. Charges
  // the (capped) base price rather than handing players out for free.
  finishAuction() {
    const a = this.auction;
    a.phase = 'FINISHED';
    a.status = 'FINISHED';

    const boughtIds = new Set();
    this.teams.forEach(t => t.squad.forEach(s => boughtIds.add(s.id)));
    const unassigned = shuffleArray(a.unsoldQueue.map(id => this._findPlayer(id)).filter(Boolean)
      .concat(rawPlayersData.filter(p => a.sets.some(s => s.playerIds.includes(p.id)) && !boughtIds.has(p.id))));

    const seen = new Set();
    const pool = unassigned.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));

    let pIdx = 0;
    this.teams.forEach(t => {
      while (t.squad.length < this.maxSquadSize && pIdx < pool.length) {
        const p = pool[pIdx];
        const price = Math.min(p.basePrice, t.purse);
        if (price > 0) {
          t.purse = round2(t.purse - price);
          t.squad.push({ ...p, soldPrice: price, viaAutoFill: true });
        } else {
          t.squad.push({ ...p, soldPrice: 0, viaAutoFill: true });
        }
        this._recomputeTeamStrength(t);
        pIdx++;
      }
    });

    // Generate the schedule now (so standings/fixtures can be shown), but
    // hold in PRE_MATCH until every human team confirms they're ready —
    // gives everyone a look at the bracket/table before the first ball.
    this.status = 'PRE_MATCH';
    this.teams.forEach(t => { t.readyForMatches = !!t.isAi; });
    this.generateSchedule();
  }

  setTeamReady(teamId) {
    if (this.status !== 'PRE_MATCH') return { ok: false, reason: 'WRONG_STATUS' };
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return { ok: false, reason: 'NOT_FOUND' };
    team.readyForMatches = true;
    if (this.teams.every(t => t.readyForMatches)) {
      this.status = 'MATCHES';
    }
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Tournament scheduling — dynamic team count, byes for odd counts
  // -------------------------------------------------------------------------
  generateSchedule() {
    const ids = this.teams.map(t => t.id);
    if (ids.length < 2) {
      this.status = 'FINISHED';
      this.tournament.winnerTeamId = ids[0] || null;
      return;
    }

    const arr = [...ids];
    if (arr.length % 2 === 1) arr.push(null); // BYE sentinel
    const n = arr.length;
    const numRounds = n - 1;
    const half = n / 2;

    const rounds = [];
    const rot = [...arr];
    for (let r = 0; r < numRounds; r++) {
      const matches = [];
      for (let i = 0; i < half; i++) {
        const a = rot[i], b = rot[n - 1 - i];
        if (a === null || b === null) continue;
        const [t1, t2] = (r + i) % 2 === 0 ? [a, b] : [b, a];
        matches.push(this.createMatchObject(t1, t2, r, matches.length));
      }
      rounds.push({ roundIndex: r, name: `Round ${r + 1}`, matches, status: 'PENDING', kind: 'LEAGUE' });
      rot.splice(1, 0, rot.pop());
    }

    this.tournament.rounds = rounds;
    this.tournament.currentRound = 0;
    this.tournament.structure = ids.length >= 4 ? 'IPL4' : (ids.length === 3 ? 'FINAL' : 'NONE');
    this.tournament.winnerTeamId = null;
    this.updatePointsTable();
  }

  createMatchObject(team1Id, team2Id, roundIdx, matchIdx) {
    const maxWickets = Math.max(2, this.maxSquadSize - 1);
    const t1 = this.teams.find(t => t.id === team1Id);
    const t2 = this.teams.find(t => t.id === team2Id);
    const battingOrder = {
      [team1Id]: (t1?.squad || []).map(p => p.id),
      [team2Id]: (t2?.squad || []).map(p => p.id)
    };
    const playerStats = {};
    [t1, t2].forEach(t => (t?.squad || []).forEach(p => {
      playerStats[p.id] = { playerId: p.id, name: p.name, teamId: t.id, runs: 0, ballsFaced: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, out: false };
    }));

    return {
      id: `m_${roundIdx}_${matchIdx}`,
      roundIndex: roundIdx,
      team1Id,
      team2Id,
      battingTeamId: team1Id,
      bowlingTeamId: team2Id,
      innings: 1,
      runs1: 0,
      wickets1: 0,
      overs1: 0,
      balls1: 0,
      runs2: 0,
      wickets2: 0,
      overs2: 0,
      balls2: 0,
      target: null,
      maxWickets,
      status: 'SCHEDULED',
      winnerId: null,
      tossWinnerId: null,
      tossChoice: null, // 'bat' | 'bowl'
      tossWaitTicks: 0,
      lastBallEvent: null, // 'SIX' | 'FOUR' | 'WICKET' | null — for client-side celebration animations
      lastBallSeq: 0,      // increments every resolved ball, so repeats of the same event still trigger a fresh celebration
      bowlerWaitTicks: 0,  // separate from waitTicks (the hand-choice countdown) so the two waits don't stomp each other's UI
      commentary: [`Match scheduled between ${team1Id} and ${team2Id}`],
      recentChoices: { [team1Id]: [], [team2Id]: [] },
      waitTicks: 0,
      interactiveInput: {
        team1Choice: null,
        team2Choice: null
      },
      // Per-player attribution (batting order fixed by squad order; wicket
      // advances to the next batsman. Bowler is chosen fresh each over —
      // by the controlling human, or auto-picked respecting the rotation
      // cap for AI teams — so a match can't resolve balls until it's set.)
      battingOrder,
      battingIndex: { [team1Id]: 0, [team2Id]: 0 },
      currentBowlerId: { [team1Id]: null, [team2Id]: null },
      bowlerOversBowled: { [team1Id]: {}, [team2Id]: {} },
      lastBowlerId: { [team1Id]: null, [team2Id]: null },
      playerStats,
      awaitingBowlerFor: null // teamId currently expected to pick a bowler, or null
    };
  }

  maxOversPerBowler() {
    return Math.max(1, Math.ceil(this.overs / 5));
  }

  findRound(kind) {
    return this.tournament.rounds.find(r => r.kind === kind);
  }

  pushRound(kind, name, specs) {
    const roundIndex = this.tournament.rounds.length;
    const matches = specs.map(([a, b, label], i) => {
      const m = this.createMatchObject(a, b, roundIndex, i);
      m.name = label;
      return m;
    });
    this.tournament.rounds.push({ roundIndex, name, matches, status: 'PENDING', kind });
    this.tournament.currentRound = roundIndex;
  }

  finishTournament(winnerTeamId) {
    this.status = 'FINISHED';
    this.tournament.winnerTeamId = winnerTeamId || null;
  }

  advanceTournamentStage() {
    const { structure } = this.tournament;
    const leagueDone = this.tournament.rounds
      .filter(r => r.kind === 'LEAGUE').every(r => r.status === 'COMPLETED');
    if (!leagueDone) return;

    this.updatePointsTable();
    const table = this.tournament.pointsTable;
    if (table.length < 2) return this.finishTournament(table[0]?.teamId);

    if (structure === 'NONE') {
      return this.finishTournament(table[0]?.teamId);
    }

    if (structure === 'FINAL') {
      const f = this.findRound('FINAL');
      if (!f) return this.pushRound('FINAL', 'Grand Final', [[table[0].teamId, table[1].teamId, 'Final']]);
      if (f.status === 'COMPLETED') return this.finishTournament(f.matches[0].winnerId);
      return;
    }

    // IPL4 structure
    if (table.length < 4) return this.finishTournament(table[0]?.teamId);

    const s1 = this.findRound('Q1_ELIM');
    if (!s1) {
      return this.pushRound('Q1_ELIM', 'Playoffs', [
        [table[0].teamId, table[1].teamId, 'Qualifier 1'],
        [table[2].teamId, table[3].teamId, 'Eliminator'],
      ]);
    }
    if (s1.status !== 'COMPLETED') return;

    const q1 = s1.matches[0], el = s1.matches[1];
    const q1Loser = q1.winnerId === q1.team1Id ? q1.team2Id : q1.team1Id;

    const q2 = this.findRound('Q2');
    if (!q2) return this.pushRound('Q2', 'Qualifier 2', [[q1Loser, el.winnerId, 'Qualifier 2']]);
    if (q2.status !== 'COMPLETED') return;

    const fin = this.findRound('FINAL');
    if (!fin) return this.pushRound('FINAL', 'Grand Final', [[q1.winnerId, q2.matches[0].winnerId, 'IPL Final']]);
    if (fin.status === 'COMPLETED') return this.finishTournament(fin.matches[0].winnerId);
  }

  // -------------------------------------------------------------------------
  // Hand Cricket engine
  // -------------------------------------------------------------------------
  tickCricketEngine() {
    if (this.status !== 'MATCHES' || this.isPaused) return;

    const currentRoundObj = this.tournament.rounds[this.tournament.currentRound];
    if (!currentRoundObj) {
      this.advanceTournamentStage();
      return;
    }

    let allRoundMatchesDone = true;

    currentRoundObj.matches.forEach(match => {
      if (match.status === 'COMPLETED') return;
      allRoundMatchesDone = false;

      if (match.status === 'SCHEDULED') {
        this.startToss(match);
      }

      if (match.status === 'TOSS') {
        this.tickToss(match);
      }

      if (match.status === 'TOSS_RESULT') {
        match.tossWaitTicks = (match.tossWaitTicks || 0) + 1;
        if (match.tossWaitTicks >= TOSS_RESULT_HOLD_TICKS) {
          match.status = 'LIVE';
          match.commentary.unshift(`Match started! ${match.battingTeamId} is batting first.`);
        }
      }

      if (match.status === 'LIVE') {
        this.processMatchBall(match);
      }
    });

    if (allRoundMatchesDone) {
      currentRoundObj.status = 'COMPLETED';
      this.updatePointsTable();
      if (currentRoundObj.kind === 'LEAGUE' &&
          this.tournament.rounds.filter(r => r.kind === 'LEAGUE').some(r => r.status !== 'COMPLETED')) {
        this.tournament.currentRound += 1;
      } else {
        this.advanceTournamentStage();
      }
    }
  }

  botChoice(strength, role, opponentRecent) {
    if (role === 'bat') {
      const t = clamp((strength.bat - 50) / 50, 0, 1);
      const w = [1, 1, 1, 1 + 0.8 * t, 1 + 0.4 * t, 1 + 1.2 * t];
      return weightedPick(w);
    }
    const t = clamp((strength.bowl - 50) / 50, 0, 1);
    const w = [1, 1, 1, 1, 1, 1];
    (opponentRecent || []).slice(-6).forEach(c => { w[c - 1] += 0.9 * t; });
    return weightedPick(w);
  }

  // Coin toss: pick a random winner, then either auto-decide (AI) or wait
  // for the winning human to choose bat/bowl. A simple heuristic favours
  // bowling first when the side's bowling is relatively stronger than its
  // batting, and vice versa — not a hard rule, just enough to feel sensible.
  startToss(match) {
    const t1 = this.teams.find(t => t.id === match.team1Id);
    const t2 = this.teams.find(t => t.id === match.team2Id);
    match.tossWinnerId = Math.random() < 0.5 ? match.team1Id : match.team2Id;
    match.status = 'TOSS';
    match.tossWaitTicks = 0;
    match.commentary.unshift(`🪙 Toss: ${match.tossWinnerId} won the toss.`);

    const winnerTeam = match.tossWinnerId === match.team1Id ? t1 : t2;
    if (winnerTeam.isAi) {
      const choice = winnerTeam.strength.bowl > winnerTeam.strength.bat ? 'bowl' : 'bat';
      this._applyTossChoice(match, choice);
    }
  }

  tickToss(match) {
    if (match.tossChoice) return; // already resolved this tick by an AI pick or a human action
    match.tossWaitTicks = (match.tossWaitTicks || 0) + 1;
    if (match.tossWaitTicks < TOSS_WAIT_TICKS) return;
    const winnerTeam = this.teams.find(t => t.id === match.tossWinnerId);
    const choice = winnerTeam.strength.bowl > winnerTeam.strength.bat ? 'bowl' : 'bat';
    match.commentary.unshift(`⏱ ${winnerTeam.shortName} auto-chose to ${choice} — no pick in time.`);
    this._applyTossChoice(match, choice);
  }

  _applyTossChoice(match, choice) {
    match.tossChoice = choice;
    const winnerId = match.tossWinnerId;
    const loserId = winnerId === match.team1Id ? match.team2Id : match.team1Id;
    match.battingTeamId = choice === 'bat' ? winnerId : loserId;
    match.bowlingTeamId = choice === 'bat' ? loserId : winnerId;
    const winnerTeam = this.teams.find(t => t.id === winnerId);
    match.commentary.unshift(`${winnerTeam.shortName} chose to ${choice.toUpperCase()} first.`);
    match.status = 'TOSS_RESULT';
    match.tossWaitTicks = 0;
  }

  // Human action: the toss-winning team chooses to bat or bowl first.
  selectTossChoice(match, teamId, choice) {
    if (match.status !== 'TOSS') return { ok: false, reason: 'NOT_TOSS_PHASE' };
    if (match.tossWinnerId !== teamId) return { ok: false, reason: 'NOT_TOSS_WINNER' };
    if (choice !== 'bat' && choice !== 'bowl') return { ok: false, reason: 'INVALID_CHOICE' };
    this._applyTossChoice(match, choice);
    return { ok: true };
  }

  // Auto-pick a bowler for an AI-controlled team, respecting the per-bowler
  // overs cap. Picks whichever eligible squad member (excluding whoever
  // bowled the previous over, if others are available) has bowled the
  // fewest overs so far, favouring stronger bowlers.
  autoPickBowler(match, teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return null;
    const cap = this.maxOversPerBowler();
    const bowled = match.bowlerOversBowled[teamId] || {};
    const last = match.lastBowlerId[teamId];
    let eligible = team.squad.filter(p => (bowled[p.id] || 0) < cap);
    if (eligible.length > 1 && last) {
      const withoutLast = eligible.filter(p => p.id !== last);
      if (withoutLast.length > 0) eligible = withoutLast;
    }
    if (eligible.length === 0) eligible = team.squad; // shouldn't happen if squad size is sane
    eligible = [...eligible].sort((a, b) => (bowled[a.id] || 0) - (bowled[b.id] || 0) || b.bowlingSkill - a.bowlingSkill);
    return eligible[0]?.id || null;
  }

  // Admin/team action: assign the bowler for the upcoming over. Rejects if
  // that bowler has already bowled the maximum overs allowed.
  selectBowler(match, teamId, playerId) {
    if (match.bowlingTeamId !== teamId) return { ok: false, reason: 'NOT_BOWLING_TEAM' };
    const team = this.teams.find(t => t.id === teamId);
    const player = team?.squad.find(p => p.id === playerId);
    if (!player) return { ok: false, reason: 'NOT_IN_SQUAD' };
    const bowled = match.bowlerOversBowled[teamId]?.[playerId] || 0;
    if (bowled >= this.maxOversPerBowler()) return { ok: false, reason: 'OVERS_LIMIT' };
    match.currentBowlerId[teamId] = playerId;
    match.awaitingBowlerFor = null;
    match.bowlerWaitTicks = 0;
    return { ok: true };
  }

  // Admin/team action: pick the next batsman after a wicket (defaults to
  // strict batting order if the human doesn't choose in time via auto-pick
  // in processMatchBall).
  selectNextBatsman(match, teamId, playerId) {
    if (match.battingTeamId !== teamId) return { ok: false, reason: 'NOT_BATTING_TEAM' };
    const order = match.battingOrder[teamId] || [];
    const stats = match.playerStats;
    if (!order.includes(playerId) || stats[playerId]?.out) return { ok: false, reason: 'INVALID_PLAYER' };
    const idx = order.indexOf(playerId);
    match.battingIndex[teamId] = idx;
    match.awaitingBatsmanFor = null;
    return { ok: true };
  }

  currentBatsmanId(match, teamId) {
    const order = match.battingOrder[teamId] || [];
    const idx = match.battingIndex[teamId] || 0;
    return order[idx] || null;
  }

  processMatchBall(match) {
    const batTeam = this.teams.find(t => t.id === match.battingTeamId);
    const bowlTeam = this.teams.find(t => t.id === match.bowlingTeamId);
    if (!batTeam || !bowlTeam) return;

    // A wicket just fell for a human-controlled batting side: wait for them
    // to pick the next batsman before any further ball resolves. Checked
    // first and unconditionally returns, so it can never be short-circuited
    // by the bowler pick or ball-resolution logic below re-using a stale
    // (already-out) batsman for another ball on the same tick.
    if (match.awaitingBatsmanFor === match.battingTeamId) {
      match.waitTicks = (match.waitTicks || 0) + 1;
      if (match.waitTicks < MOVE_AUTO_PICK_TICKS) return;
      const order = match.battingOrder[match.battingTeamId] || [];
      const nextIdx = order.findIndex(id => !match.playerStats[id]?.out);
      if (nextIdx >= 0) match.battingIndex[match.battingTeamId] = nextIdx;
      match.awaitingBatsmanFor = null;
      match.waitTicks = 0;
      return; // resume ball resolution on the next tick with the new batsman in place
    }

    // A new over needs a bowler picked before any ball can be bowled.
    // Human-controlled bowling teams get to choose; AI teams auto-pick
    // instantly so they never stall the match.
    if (!match.currentBowlerId[match.bowlingTeamId]) {
      if (bowlTeam.isAi) {
        match.currentBowlerId[match.bowlingTeamId] = this.autoPickBowler(match, match.bowlingTeamId);
      } else {
        match.awaitingBowlerFor = match.bowlingTeamId;
        match.bowlerWaitTicks = (match.bowlerWaitTicks || 0) + 1;
        if (match.bowlerWaitTicks < BOWLER_PICK_WAIT_TICKS) return;
        match.currentBowlerId[match.bowlingTeamId] = this.autoPickBowler(match, match.bowlingTeamId);
        match.bowlerWaitTicks = 0;
        match.awaitingBowlerFor = null;
        match.commentary.unshift(`⏱ ${bowlTeam.shortName} auto-selected a bowler — no pick in time.`);
      }
    }

    let batChoice = match.battingTeamId === match.team1Id ? match.interactiveInput.team1Choice : match.interactiveInput.team2Choice;
    let bowlChoice = match.bowlingTeamId === match.team1Id ? match.interactiveInput.team1Choice : match.interactiveInput.team2Choice;

    const batWaiting = !batTeam.isAi && !batChoice;
    const bowlWaiting = !bowlTeam.isAi && !bowlChoice;

    if (batWaiting || bowlWaiting) {
      match.waitTicks = (match.waitTicks || 0) + 1;
      if (match.waitTicks < MOVE_AUTO_PICK_TICKS) return;

      // Auto-play a single ball for whichever human hasn't moved in time.
      // This never converts the team to AI — a slow connection or a moment
      // away from the keyboard should not cost a player their franchise.
      if (batWaiting) {
        batChoice = this.botChoice(batTeam.strength, 'bat');
        match.commentary.unshift(`⏱ ${batTeam.shortName} auto-played — no input in time.`);
      }
      if (bowlWaiting) {
        bowlChoice = this.botChoice(bowlTeam.strength, 'bowl', match.recentChoices[batTeam.id]);
        match.commentary.unshift(`⏱ ${bowlTeam.shortName} auto-played — no input in time.`);
      }
    }

    match.waitTicks = 0;

    if (!batChoice) batChoice = this.botChoice(batTeam.strength, 'bat');
    if (!bowlChoice) bowlChoice = this.botChoice(bowlTeam.strength, 'bowl', match.recentChoices[batTeam.id]);

    match.lastBatChoice = batChoice;
    match.lastBowlChoice = bowlChoice;
    match.recentChoices[batTeam.id] = [...(match.recentChoices[batTeam.id] || []), batChoice].slice(-10);

    match.interactiveInput.team1Choice = null;
    match.interactiveInput.team2Choice = null;

    const batTier = clamp((batTeam.strength.bat - 50) / 50, 0, 1);
    const bowlTier = clamp((bowlTeam.strength.bowl - 50) / 50, 0, 1);
    const maxBallsPerInnings = this.overs * 6;

    const batsmanId = this.currentBatsmanId(match, match.battingTeamId);
    const bowlerId = match.currentBowlerId[match.bowlingTeamId];
    const batsmanStat = match.playerStats[batsmanId];
    const bowlerStat = match.playerStats[bowlerId];

    const resolveBall = (runsField, wktsField, ballsField, oversField, inningsNum) => {
      match[ballsField] += 1;
      const overNum = Math.floor(match[ballsField] / 6);
      const ballNum = match[ballsField] % 6;
      match[oversField] = overNum + ballNum / 10;

      let isWicket = batChoice === bowlChoice;
      let runsScored = batChoice;
      let note = null;

      if (isWicket) {
        if (Math.random() < SKILL_SAVE_P * batTier) {
          isWicket = false;
          runsScored = 0;
          note = `Dropped! Reprieve for ${batTeam.shortName}.`;
        }
      } else if (Math.abs(batChoice - bowlChoice) === 1 && Math.random() < SKILL_STEAL_P * bowlTier) {
        isWicket = true;
        runsScored = 0;
        note = `Beaten by the change of pace — WICKET!`;
      } else if (Math.random() < SKILL_BOUNDARY_P * batTier) {
        const upgrade = { 1: 2, 2: 3, 3: 4, 4: 6, 5: 6, 6: 6 };
        runsScored = upgrade[batChoice];
        note = `Edged past for extra — top-order class.`;
      }

      if (batsmanStat) batsmanStat.ballsFaced += 1;
      if (bowlerStat) bowlerStat.ballsBowled += 1;

      if (isWicket) {
        match[wktsField] += 1;
        if (batsmanStat) { batsmanStat.out = true; }
        if (bowlerStat) bowlerStat.wickets += 1;
        const batsmanName = batsmanStat?.name || batTeam.shortName;
        match.commentary.unshift(`[Innings ${inningsNum} - ${match[oversField].toFixed(1)} ov] WICKET! ${batsmanName} out! Choice: ${batChoice} vs ${bowlChoice}`);
        match.lastBallEvent = 'WICKET';
        match.lastBallSeq = (match.lastBallSeq || 0) + 1;
        // Advance to the next batsman in order; a human team gets a chance
        // to pick manually before the next ball via awaitingBatsmanFor.
        const order = match.battingOrder[match.battingTeamId] || [];
        const nextIdx = (match.battingIndex[match.battingTeamId] || 0) + 1;
        if (nextIdx < order.length) {
          if (!batTeam.isAi) {
            match.awaitingBatsmanFor = match.battingTeamId;
          } else {
            match.battingIndex[match.battingTeamId] = nextIdx;
          }
        }
      } else {
        match[runsField] += runsScored;
        if (batsmanStat) batsmanStat.runs += runsScored;
        if (bowlerStat) bowlerStat.runsConceded += runsScored;
        const suffix = note ? ` ${note}` : '';
        match.commentary.unshift(`[Innings ${inningsNum} - ${match[oversField].toFixed(1)} ov] ${runsScored} run(s). Choice: ${batChoice} (bat) vs ${bowlChoice} (bowl).${suffix}`);
        match.lastBallEvent = runsScored === 6 ? 'SIX' : runsScored === 4 ? 'FOUR' : null;
        match.lastBallSeq = (match.lastBallSeq || 0) + 1;
      }

      // Over boundary: credit the over to the bowler and clear the slot so
      // the next over forces a fresh pick (AI or human).
      if (match[ballsField] % 6 === 0) {
        const bowlingTeamId = match.bowlingTeamId;
        const bId = match.currentBowlerId[bowlingTeamId];
        if (bId) {
          match.bowlerOversBowled[bowlingTeamId][bId] = (match.bowlerOversBowled[bowlingTeamId][bId] || 0) + 1;
          match.lastBowlerId[bowlingTeamId] = bId;
        }
        match.currentBowlerId[bowlingTeamId] = null;
      }
    };

    if (match.innings === 1) {
      resolveBall('runs1', 'wickets1', 'balls1', 'overs1', 1);

      if (match.wickets1 >= match.maxWickets || match.balls1 >= maxBallsPerInnings) {
        match.innings = 2;
        match.target = match.runs1 + 1;
        const temp = match.battingTeamId;
        match.battingTeamId = match.bowlingTeamId;
        match.bowlingTeamId = temp;
        match.currentBowlerId[match.bowlingTeamId] = null;
        match.commentary.unshift(`Innings 1 completed! ${batTeam.shortName} scored ${match.runs1}/${match.wickets1}. Target for ${bowlTeam.shortName} is ${match.target} runs.`);
      }
    } else if (match.innings === 2) {
      resolveBall('runs2', 'wickets2', 'balls2', 'overs2', 2);

      if (match.runs2 >= match.target) {
        match.status = 'COMPLETED';
        match.winnerId = match.battingTeamId;
        match.commentary.unshift(`🎉 ${batTeam.name} WON by ${match.maxWickets - match.wickets2} wickets!`);
      } else if (match.wickets2 >= match.maxWickets || match.balls2 >= maxBallsPerInnings) {
        match.status = 'COMPLETED';
        if (match.runs2 === match.runs1) {
          match.winnerId = match.battingTeamId;
          match.commentary.unshift(`🤝 Match Tied! ${batTeam.name} awarded victory!`);
        } else {
          match.winnerId = match.bowlingTeamId;
          match.commentary.unshift(`🎉 ${bowlTeam.name} WON by ${match.runs1 - match.runs2} runs!`);
        }
      }
    }

    if (match.status === 'COMPLETED') {
      this._applyMatchStatsToTournament(match);
    }

    if (match.commentary.length > 40) match.commentary.length = 40;
  }

  // Roll a completed match's per-player stats into the room-wide tournament
  // leaderboard (orange cap / purple cap), keyed by player id.
  _applyMatchStatsToTournament(match) {
    if (!this.tournament.playerStats) this.tournament.playerStats = {};
    const agg = this.tournament.playerStats;
    Object.values(match.playerStats).forEach(s => {
      if (!agg[s.playerId]) {
        agg[s.playerId] = { playerId: s.playerId, name: s.name, teamId: s.teamId, runs: 0, wickets: 0, matches: 0 };
      }
      agg[s.playerId].runs += s.runs;
      agg[s.playerId].wickets += s.wickets;
      agg[s.playerId].matches += 1;
      agg[s.playerId].teamId = s.teamId; // keep current team (in case of future trades — not applicable now, but future-proof)
    });
  }

  // -------------------------------------------------------------------------
  // Points table
  // -------------------------------------------------------------------------
  updatePointsTable() {
    const tableMap = {};
    this.teams.forEach(t => {
      tableMap[t.id] = {
        teamId: t.id, teamName: t.name, shortName: t.shortName, color: t.color,
        played: 0, won: 0, lost: 0, points: 0,
        runsScored: 0, oversFaced: 0, runsConceded: 0, oversBowled: 0, nrr: 0
      };
    });

    this.tournament.rounds.filter(r => r.kind === 'LEAGUE').forEach(r => {
      r.matches.forEach(m => {
        if (m.status !== 'COMPLETED') return;
        const t1 = tableMap[m.team1Id];
        const t2 = tableMap[m.team2Id];
        if (!t1 || !t2) return;

        t1.played += 1;
        t2.played += 1;

        t1.runsScored += m.runs1;
        t1.oversFaced += Math.floor(m.overs1) + (m.overs1 % 1) * 10 / 6;
        t1.runsConceded += m.runs2;
        t1.oversBowled += Math.floor(m.overs2) + (m.overs2 % 1) * 10 / 6;

        t2.runsScored += m.runs2;
        t2.oversFaced += Math.floor(m.overs2) + (m.overs2 % 1) * 10 / 6;
        t2.runsConceded += m.runs1;
        t2.oversBowled += Math.floor(m.overs1) + (m.overs1 % 1) * 10 / 6;

        if (m.winnerId === m.team1Id) {
          t1.won += 1; t1.points += 2; t2.lost += 1;
        } else {
          t2.won += 1; t2.points += 2; t1.lost += 1;
        }
      });
    });

    const list = Object.values(tableMap).map(row => {
      const batFor = row.oversFaced > 0 ? row.runsScored / row.oversFaced : 0;
      const batAgainst = row.oversBowled > 0 ? row.runsConceded / row.oversBowled : 0;
      row.nrr = parseFloat((batFor - batAgainst).toFixed(3));
      return row;
    });

    list.sort((a, b) => b.points - a.points || b.nrr - a.nrr);
    this.tournament.pointsTable = list;
  }
}

// ---------------------------------------------------------------------------
// Room Manager Registry
// ---------------------------------------------------------------------------
class RoomManager {
  constructor() {
    this.rooms = {};
  }

  init(savedData) {
    const now = Date.now();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    for (const [code, rData] of Object.entries(savedData)) {
      const hasHumans = (rData.teams || []).some(t => !t.isAi);
      const age = now - (rData.updatedAt || 0);
      if (!hasHumans || age > MAX_AGE_MS) continue; // prune dead/stale rooms
      this.rooms[code] = new Room(rData);
    }
  }

  createRoom(adminSocketId, { overs = 2, maxSquadSize = 7, hostToken } = {}) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = new Room({
      code,
      adminSocketId,
      hostToken,
      overs,
      maxSquadSize,
      purseLimit: 100.0
    });
    this.rooms[code] = room;
    return room;
  }

  getRoom(code) {
    return this.rooms[code] || null;
  }
}

export const roomManager = new RoomManager();
export { bidIncrement, nextBidAmount, round2 };
