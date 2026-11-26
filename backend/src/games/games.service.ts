import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MiniGameKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  createLudoState,
  currentPlayer,
  ludoMove,
  ludoRemovePlayer,
  ludoRoll,
  LudoState,
  rollDice,
} from './engines/ludo.engine';
import {
  BootsCell,
  BootsOrientation,
  BootsPublicState,
  BootsState,
  bootsForfeit,
  bootsPublicState,
  createBootsState,
  clearBoots,
  fire,
  markReady,
  normalizeFleet,
  parseCoord,
  placeBoot,
  placeBootsRandom,
} from './engines/boots.engine';
import {
  createRpsState,
  isRpsChoice,
  rpsForfeit,
  rpsNextRound,
  rpsPick,
  rpsPublicState,
  RpsPublicState,
  RpsState,
} from './engines/rps.engine';
import {
  CutPublicState,
  CutState,
  createCutState,
  cutDraw,
  cutForfeit,
  cutPublicState,
} from './engines/cut.engine';
import {
  ChessMove,
  ChessState,
  ChessPublicState,
  chessForfeit,
  chessMove,
  chessPublicState,
  createChessState,
} from './engines/chess.engine';
import {
  UNO_COLORS,
  UnoColor,
  UnoPublicState,
  UnoState,
  createUnoState,
  unoCall,
  unoDraw,
  unoForfeit,
  unoPass,
  unoPlay,
  unoPublicState,
} from './engines/uno.engine';
import {
  RacePublicState,
  RaceState,
  RaceTick,
  createRaceState,
  raceAttack,
  raceForfeit,
  raceNitro,
  racePublicState,
  raceStep,
  raceSteer,
  raceTick,
} from './engines/race.engine';

/**
 * Taunts players can throw at each other mid-game. A closed set on purpose:
 * this is broadcast to everyone in the room with no moderation in between, so
 * it is four fixed reactions rather than "any string the client sends".
 */
export const GAME_REACTIONS = ['angry', 'loser', 'laughing', 'cool'] as const;
export type GameReaction = (typeof GAME_REACTIONS)[number];

export type GameKind =
  'rps' | 'ludo' | 'boots' | 'cut' | 'chess' | 'uno' | 'race';

export const GAME_CATALOG: Record<
  GameKind,
  {
    title: string;
    minPlayers: number;
    maxPlayers: number;
    /**
     * Whether a non-player can watch a live match. Only true for games with
     * no hidden information — Boots would leak ship positions to anyone who
     * "watched", so it stays players-only.
     */
    spectatable: boolean;
  }
> = {
  rps: { title: 'Stone Paper Scissors', minPlayers: 2, maxPlayers: 2, spectatable: false },
  ludo: { title: 'Ludo', minPlayers: 2, maxPlayers: 4, spectatable: true },
  boots: { title: 'Boots', minPlayers: 2, maxPlayers: 4, spectatable: false },
  cut: { title: 'Cut', minPlayers: 2, maxPlayers: 4, spectatable: true },
  chess: { title: 'Chess', minPlayers: 2, maxPlayers: 2, spectatable: true },
  // Hands are secret, so a "spectator" would be looking at cards nobody
  // at the table can see — UNO stays players-only, like Boots.
  uno: { title: 'UNO', minPlayers: 2, maxPlayers: 4, spectatable: false },
  // Road Rash is retired from the hub — keep the catalog entry so in-flight
  // / reconnect rooms still resolve, but createRoom rejects new ones.
  race: {
    title: 'Road Rash Rush',
    minPlayers: 1,
    maxPlayers: 4,
    spectatable: true,
  },
};

/** Games that can no longer be started from the hub. */
export const HIDDEN_GAMES = new Set<GameKind>(['race']);

/** This GameKind, as the GameMatch/GameMatchPlayer `MiniGameKind` enum spells it. */
const GAME_KIND_DB: Record<GameKind, MiniGameKind> = {
  rps: MiniGameKind.RPS,
  ludo: MiniGameKind.LUDO,
  boots: MiniGameKind.BOOTS,
  cut: MiniGameKind.CUT,
  chess: MiniGameKind.CHESS,
  uno: MiniGameKind.UNO,
  race: MiniGameKind.RACE,
};

export interface RoomPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  seat: number;
  connected: boolean;
}

export interface RoomSpectator {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

interface Room {
  id: string;
  orgId: string;
  game: GameKind;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  /** Non-players watching a live, spectatable match (Chess / Ludo only). */
  spectators: RoomSpectator[];
  maxPlayers: number;
  createdAt: number;
  rps: RpsState | null;
  ludo: LudoState | null;
  boots: BootsState | null;
  cut: CutState | null;
  chess: ChessState | null;
  uno: UnoState | null;
  race: RaceState | null;
  /** Host-chosen boot lengths for Boots (e.g. [5,3,2]). */
  bootsFleet: number[] | null;
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * Who was in the room when startGame() ran — captured once and never
   * mutated again. A player who forfeits is spliced out of `players` (and
   * out of the engine's own `playerIds`) the moment they leave, so by the
   * time a match finishes that is no longer the full roster. This is what
   * GameMatch history is written from instead, so a loss-by-forfeit still
   * shows up as a loss for the person who left.
   */
  matchPlayers: string[];
}

/** What every client in the room receives on each change. */
export interface RoomView {
  id: string;
  orgId: string;
  game: GameKind;
  title: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  spectators: RoomSpectator[];
  /** Whether a non-player can watch this game live. */
  spectatable: boolean;
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  rps: RpsPublicState | null;
  ludo: LudoState | null;
  /** Viewer-scoped — opponent boots stay hidden until sunk. */
  boots: BootsPublicState | null;
  /** Fully public — Cut hides nothing from anyone. */
  cut: CutPublicState | null;
  /** Viewer-scoped only for whose turn it is; the board itself is public. */
  chess: ChessPublicState | null;
  /** Viewer-scoped — you see your own hand, everyone else's card count. */
  uno: UnoPublicState | null;
  /**
   * The grid only: who is in which seat and the seed the road is drawn from.
   * The race itself moves far too fast for this channel and rides on its own
   * `race:tick` instead.
   */
  race: RacePublicState | null;
  /** Lobby preview of the Boots fleet sizes. */
  bootsFleet: number[] | null;
  /** Server time when the current action auto-resolves (Ludo turn timer). */
  deadline: number | null;
}

export type RoomListener = (
  room: RoomView,
  event?: { type: string; payload?: unknown },
  /** When set, only this user should receive the update (viewer-scoped Boots). */
  targetUserId?: string,
) => void;
export type OrgListener = (orgId: string) => void;
/** Raw, high-frequency broadcast for the one real-time game. */
export type TickListener = (roomId: string, tick: RaceTick) => void;

const RPS_REVEAL_MS = 2600;
const LUDO_TURN_MS = 30_000;
const LUDO_AUTO_MOVE_MS = 700;
/** How long a disconnected player keeps their seat before being dropped. */
const DISCONNECT_GRACE_MS = 45_000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
/** Road Rash broadcasts at 20Hz, three 60fps frames to a tick. */
const RACE_TICK_MS = 50;
const RACE_FRAMES_PER_TICK = 3;

/**
 * In-memory game rooms (single backend instance, same assumption as the
 * mediasoup SFU). Rooms are scoped to an org — teammates see each other's
 * open rooms in the Games lobby and can join with a tap.
 */
@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);
  private readonly rooms = new Map<string, Room>();
  /** userId -> roomId (a user is in at most one room at a time). */
  private readonly userRoom = new Map<string, string>();
  /**
   * userId -> roomId for spectating. Separate from `userRoom`: watching a
   * match carries none of the "one seat, reconnect grace period, forfeit on
   * drop" stakes a player has, so it gets its own simple map rather than
   * reusing player bookkeeping.
   */
  private readonly spectatorRoom = new Map<string, string>();
  private readonly disconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly deadlines = new Map<string, number>();
  private onRoom: RoomListener = () => {};
  private onOrg: OrgListener = () => {};
  private onTick: TickListener = () => {};
  /** roomId -> the 20Hz loop driving a live race. */
  private readonly raceLoops = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  constructor(private readonly prisma?: PrismaService) {}

  setListeners(
    onRoom: RoomListener,
    onOrg: OrgListener,
    onTick?: TickListener,
  ) {
    this.onRoom = onRoom;
    this.onOrg = onOrg;
    if (onTick) this.onTick = onTick;
  }

  // ─── lobby ────────────────────────────────────────────────────────────

  listRooms(orgId: string): RoomView[] {
    const now = Date.now();
    return [...this.rooms.values()]
      .filter(
        (r) =>
          r.orgId === orgId &&
          r.status !== 'finished' &&
          now - r.createdAt < ROOM_TTL_MS,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => this.view(r));
  }

  /** Current view of a room by id (undefined if it's gone or already finished). */
  roomViewById(roomId: string): RoomView | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.status === 'finished') return undefined;
    if (Date.now() - room.createdAt >= ROOM_TTL_MS) return undefined;
    return this.view(room);
  }

  roomOf(userId: string): RoomView | null {
    const id = this.userRoom.get(userId);
    const room = id ? this.rooms.get(id) : undefined;
    return room ? this.view(room, userId) : null;
  }

  createRoom(
    orgId: string,
    host: Omit<RoomPlayer, 'seat' | 'connected'>,
    game: GameKind,
    maxPlayers?: number,
    bootsFleet?: number[],
  ): RoomView {
    const spec = GAME_CATALOG[game];
    if (!spec) throw new Error('Unknown game');
    if (HIDDEN_GAMES.has(game)) throw new Error('That game is no longer available');
    this.leaveRoom(host.userId); // one room at a time
    this.unspectateRoom(host.userId);
    // Socket payloads are untyped at runtime — a non-numeric/garbage
    // maxPlayers (object, NaN, string that doesn't coerce) must not become
    // NaN here, or `players.length >= room.maxPlayers` is false forever and
    // the room never closes to new joiners.
    const requested = Number.isFinite(maxPlayers)
      ? (maxPlayers as number)
      : spec.maxPlayers;
    const max = Math.min(
      spec.maxPlayers,
      Math.max(spec.minPlayers, Math.trunc(requested)),
    );
    const room: Room = {
      id: randomBytes(6).toString('hex'),
      orgId,
      game,
      hostId: host.userId,
      status: 'lobby',
      players: [{ ...host, seat: 0, connected: true }],
      spectators: [],
      maxPlayers: max,
      createdAt: Date.now(),
      rps: null,
      ludo: null,
      boots: null,
      cut: null,
      chess: null,
      uno: null,
      race: null,
      bootsFleet: game === 'boots' ? normalizeFleet(bootsFleet) : null,
      timer: null,
      matchPlayers: [],
    };
    this.rooms.set(room.id, room);
    this.userRoom.set(host.userId, room.id);
    this.onOrg(orgId);
    return this.view(room);
  }

  joinRoom(
    roomId: string,
    orgId: string,
    player: Omit<RoomPlayer, 'seat' | 'connected'>,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room || room.orgId !== orgId) throw new Error('Room not found');
    const existing = room.players.find((p) => p.userId === player.userId);
    if (existing) {
      // Reconnect / re-open: keep the seat.
      existing.connected = true;
      this.clearDisconnectTimer(player.userId);
      this.userRoom.set(player.userId, room.id);
      this.emit(room);
      return this.view(room, player.userId);
    }
    if (room.status !== 'lobby') throw new Error('Game already started');
    if (room.players.length >= room.maxPlayers) throw new Error('Room is full');
    this.leaveRoom(player.userId);
    this.unspectateRoom(player.userId);
    room.players.push({
      ...player,
      seat: room.players.length,
      connected: true,
    });
    this.userRoom.set(player.userId, room.id);
    this.emit(room);
    this.onOrg(orgId);
    return this.view(room, player.userId);
  }

  leaveRoom(userId: string): void {
    const roomId = this.userRoom.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    this.userRoom.delete(userId);
    this.clearDisconnectTimer(userId);
    if (!room) return;

    const idx = room.players.findIndex((p) => p.userId === userId);
    if (idx >= 0) room.players.splice(idx, 1);
    room.players.forEach((p, i) => (p.seat = i));

    if (room.status === 'playing') {
      if (room.rps) rpsForfeit(room.rps, userId);
      if (room.ludo) ludoRemovePlayer(room.ludo, userId);
      if (room.boots) bootsForfeit(room.boots, userId);
      if (room.cut) cutForfeit(room.cut, userId);
      if (room.chess) chessForfeit(room.chess, userId);
      if (room.uno) unoForfeit(room.uno, userId);
      if (room.race) raceForfeit(room.race, userId);
      if (
        room.rps?.phase === 'done' ||
        room.ludo?.phase === 'done' ||
        room.boots?.phase === 'done' ||
        room.cut?.phase === 'done' ||
        room.chess?.phase === 'done' ||
        room.uno?.phase === 'done' ||
        room.race?.phase === 'done'
      ) {
        this.finish(room, 'forfeit');
        return;
      }
      if (room.ludo) this.armLudoTimer(room);
    }

    if (room.players.length === 0) {
      this.destroy(room);
      return;
    }
    if (room.hostId === userId) room.hostId = room.players[0].userId;
    this.emit(room);
    this.onOrg(room.orgId);
  }

  /** Socket dropped: keep the seat for a grace period, then treat as leave. */
  markDisconnected(userId: string): void {
    // Watching carries no seat to preserve — drop it immediately rather than
    // holding a grace period a spectator has no way to come back within.
    this.unspectateRoom(userId);
    const roomId = this.userRoom.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room) return;
    const player = room.players.find((p) => p.userId === userId);
    if (!player) return;
    player.connected = false;
    this.emit(room);
    this.clearDisconnectTimer(userId);
    this.disconnectTimers.set(
      userId,
      setTimeout(() => {
        this.disconnectTimers.delete(userId);
        const still = this.rooms.get(roomId!);
        const p = still?.players.find((x) => x.userId === userId);
        if (p && !p.connected) this.leaveRoom(userId);
      }, DISCONNECT_GRACE_MS),
    );
  }

  markConnected(userId: string): RoomView | null {
    const roomId = this.userRoom.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room) return null;
    const player = room.players.find((p) => p.userId === userId);
    if (player) player.connected = true;
    this.clearDisconnectTimer(userId);
    this.emit(room);
    return this.view(room);
  }

  // ─── Spectating ───────────────────────────────────────────────────────

  /** Watch a live, spectatable match (Chess / Ludo) without playing in it. */
  spectateRoom(
    roomId: string,
    orgId: string,
    viewer: Omit<RoomPlayer, 'seat' | 'connected'>,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room || room.orgId !== orgId) throw new Error('Room not found');
    if (!GAME_CATALOG[room.game].spectatable) {
      throw new Error('This game cannot be watched');
    }
    if (room.status === 'lobby') throw new Error('Nothing to watch yet');
    if (room.players.some((p) => p.userId === viewer.userId)) {
      // Already playing — their own view already shows everything.
      return this.view(room, viewer.userId);
    }
    const currentRoomId = this.userRoom.get(viewer.userId);
    if (currentRoomId && currentRoomId !== room.id) {
      // Unlike joining/creating a room, watching one should never silently
      // forfeit a game this person is actively playing elsewhere. Idling in
      // another room's lobby is fine — nothing to forfeit there.
      const currentRoom = this.rooms.get(currentRoomId);
      if (currentRoom?.status === 'playing') {
        throw new Error('Finish or leave your current game before watching another');
      }
    }
    this.unspectateRoom(viewer.userId); // one watched room at a time
    if (!room.spectators.some((s) => s.userId === viewer.userId)) {
      room.spectators.push({ ...viewer });
    }
    this.spectatorRoom.set(viewer.userId, room.id);
    this.emit(room);
    return this.view(room, viewer.userId);
  }

  /** Stop watching whichever room this user is currently spectating, if any. */
  unspectateRoom(userId: string): void {
    const roomId = this.spectatorRoom.get(userId);
    if (!roomId) return;
    this.spectatorRoom.delete(userId);
    const room = this.rooms.get(roomId);
    if (!room) return;
    const idx = room.spectators.findIndex((s) => s.userId === userId);
    if (idx < 0) return;
    room.spectators.splice(idx, 1);
    this.emit(room);
  }

  startGame(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== userId) throw new Error('Only the host can start');
    if (room.status !== 'lobby') throw new Error('Already started');
    const spec = GAME_CATALOG[room.game];
    if (room.players.length < spec.minPlayers) {
      throw new Error(`Need at least ${spec.minPlayers} players`);
    }
    const ids = room.players.map((p) => p.userId);
    room.matchPlayers = [...ids];
    if (room.game === 'rps') room.rps = createRpsState([ids[0], ids[1]]);
    if (room.game === 'ludo') {
      room.ludo = createLudoState(ids);
      this.armLudoTimer(room);
    }
    if (room.game === 'boots') {
      room.boots = createBootsState(ids, room.bootsFleet ?? undefined);
    }
    if (room.game === 'cut') room.cut = createCutState(ids);
    if (room.game === 'chess') {
      // Seat order decides colour: whoever created the room plays White.
      room.chess = createChessState([ids[0], ids[1]]);
    }
    if (room.game === 'uno') room.uno = createUnoState(ids);
    if (room.game === 'race') {
      const names: Record<string, string> = {};
      for (const p of room.players) names[p.userId] = p.name;
      room.race = createRaceState(ids, names);
      this.startRaceLoop(room);
    }
    room.status = 'playing';
    this.emit(room, { type: 'started' });
    this.onOrg(room.orgId);
    return this.view(room, userId);
  }

  /** Host (or anyone, once finished) resets the room to the lobby for a rematch. */
  rematch(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'finished' && room.hostId !== userId) {
      throw new Error('Only the host can restart');
    }
    this.clearTimer(room);
    room.rps = null;
    room.ludo = null;
    room.boots = null;
    room.cut = null;
    room.chess = null;
    this.stopRaceLoop(room.id);
    room.uno = null;
    room.race = null;
    room.matchPlayers = [];
    room.status = 'lobby';
    this.deadlines.delete(room.id);
    this.emit(room, { type: 'rematch' });
    this.onOrg(room.orgId);
    return this.view(room);
  }

  // ─── Boots ────────────────────────────────────────────────────────────

  /** Host can tweak fleet sizes while still in the lobby. */
  bootsSetFleet(roomId: string, userId: string, fleet: unknown): RoomView {
    const room = this.rooms.get(roomId);
    if (!room || room.game !== 'boots') throw new Error('Not a Boots room');
    if (room.hostId !== userId) throw new Error('Only the host can set the fleet');
    if (room.status !== 'lobby') throw new Error('Fleet is locked once the game starts');
    room.bootsFleet = normalizeFleet(fleet);
    this.emit(room);
    return this.view(room);
  }

  bootsPlace(
    roomId: string,
    userId: string,
    start: unknown,
    orientation: unknown,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.boots || room.status !== 'playing')
      throw new Error('No Boots match in progress');
    const cell = this.parseBootsCell(start);
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new Error('Orientation must be horizontal or vertical');
    }
    placeBoot(room.boots, userId, cell, orientation as BootsOrientation);
    this.emit(room, { type: 'boots:place' });
    return this.view(room, userId);
  }

  bootsPlaceRandom(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.boots || room.status !== 'playing')
      throw new Error('No Boots match in progress');
    placeBootsRandom(room.boots, userId);
    this.emit(room, { type: 'boots:place' });
    return this.view(room, userId);
  }

  bootsClear(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.boots || room.status !== 'playing')
      throw new Error('No Boots match in progress');
    clearBoots(room.boots, userId);
    this.emit(room, { type: 'boots:place' });
    return this.view(room, userId);
  }

  bootsReady(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.boots || room.status !== 'playing')
      throw new Error('No Boots match in progress');
    markReady(room.boots, userId);
    this.emit(room, {
      type: room.boots.phase === 'battle' ? 'boots:battle' : 'boots:ready',
    });
    return this.view(room, userId);
  }

  bootsFire(
    roomId: string,
    userId: string,
    target: unknown,
    targetId?: string,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.boots || room.status !== 'playing')
      throw new Error('No Boots match in progress');
    const cell = this.parseBootsCell(target);
    fire(room.boots, userId, cell, targetId);
    this.emit(room, {
      type: 'boots:shot',
      payload: room.boots.lastShot,
    });
    if (room.boots.phase === 'done') this.finish(room);
    return this.view(room, userId);
  }

  private parseBootsCell(raw: unknown): BootsCell {
    if (raw && typeof raw === 'object') {
      const o = raw as { col?: unknown; row?: unknown; coord?: unknown };
      if (typeof o.coord === 'string') {
        const parsed = parseCoord(o.coord);
        if (parsed) return parsed;
      }
      if (Number.isFinite(o.col) && Number.isFinite(o.row)) {
        return { col: Number(o.col), row: Number(o.row) };
      }
    }
    if (typeof raw === 'string') {
      const parsed = parseCoord(raw);
      if (parsed) return parsed;
    }
    throw new Error('Pick a cell like B2');
  }

  // ─── Reactions ────────────────────────────────────────────────────────

  /**
   * Throw a reaction at the room. Deliberately stores nothing: it is a
   * moment, not game state, so it never lands in RoomView and a player who
   * reconnects does not get a backlog of old taunts replayed at them.
   *
   * Spam is already handled a layer up — the gateway rate-limits every
   * message per socket, so this needs no cooldown of its own.
   */
  react(roomId: string, userId: string, reaction: unknown): RoomView {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (!room.players.some((p) => p.userId === userId)) {
      throw new Error('You are not in this room');
    }
    if (
      typeof reaction !== 'string' ||
      !GAME_REACTIONS.includes(reaction as GameReaction)
    ) {
      throw new Error('Unknown reaction');
    }
    this.emit(room, { type: 'reaction', payload: { userId, reaction } });
    return this.view(room, userId);
  }

  // ─── Chess ────────────────────────────────────────────────────────────

  /**
   * Play one move. Every rule lives in the engine — this only checks that the
   * request is shaped like a move before handing it over, so an illegal move
   * is rejected by the same code that generated the legal list the client was
   * shown.
   */
  chessMove(
    roomId: string,
    userId: string,
    from: unknown,
    to: unknown,
    promotion?: unknown,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.chess || room.status !== 'playing')
      throw new Error('No chess match in progress');
    if (typeof from !== 'string' || typeof to !== 'string')
      throw new Error('Pick a square to move from and to');

    const promo =
      typeof promotion === 'string' &&
      ['q', 'r', 'b', 'n'].includes(promotion)
        ? (promotion as ChessMove['promotion'])
        : undefined;

    const record = chessMove(room.chess, userId, {
      from: from.trim(),
      to: to.trim(),
      ...(promo ? { promotion: promo } : {}),
    });
    this.emit(room, {
      type: 'chess:move',
      payload: { userId, san: record.san, from: record.from, to: record.to },
    });
    if (room.chess.phase === 'done') this.finish(room);
    return this.view(room, userId);
  }

  // ─── Road Rash (real time) ────────────────────────────────────────────

  /**
   * One input from one rider.
   *
   * Unlike every other action here this returns nothing: at a lane change per
   * press there is no sense round-tripping a whole room view, and the next
   * tick — at most 50ms away — already carries the result.
   */
  raceInput(roomId: string, userId: string, action: unknown): void {
    const room = this.rooms.get(roomId);
    if (!room?.race || room.status !== 'playing') return;
    switch (action) {
      case 'left':
        raceSteer(room.race, userId, -1);
        break;
      case 'right':
        raceSteer(room.race, userId, 1);
        break;
      case 'nitro':
        raceNitro(room.race, userId);
        break;
      case 'punch':
        raceAttack(room.race, userId, 'punch');
        break;
      case 'kick':
        raceAttack(room.race, userId, 'kick');
        break;
      default:
        break;
    }
  }

  /**
   * Drive the race.
   *
   * Twenty ticks a second, each advancing the world three 60fps frames, so
   * the physics stay the ones the game was tuned at while the wire sees a
   * twentieth of the traffic. Clients interpolate between ticks.
   */
  private startRaceLoop(room: Room) {
    this.stopRaceLoop(room.id);
    const timer = setInterval(() => {
      const live = this.rooms.get(room.id);
      if (!live?.race || live.status !== 'playing') {
        this.stopRaceLoop(room.id);
        return;
      }
      raceStep(live.race, RACE_FRAMES_PER_TICK);
      this.onTick(live.id, raceTick(live.race));
      if (live.race.phase === 'done') {
        this.stopRaceLoop(live.id);
        this.finish(live);
      }
    }, RACE_TICK_MS);
    // Node keeps the process alive for an interval; a game loop should not.
    timer.unref?.();
    this.raceLoops.set(room.id, timer);
  }

  private stopRaceLoop(roomId: string) {
    const timer = this.raceLoops.get(roomId);
    if (timer) {
      clearInterval(timer);
      this.raceLoops.delete(roomId);
    }
  }

  // ─── UNO ──────────────────────────────────────────────────────────────

  /**
   * Play one card. Every rule — what matches, what a wild needs, what the
   * next player is made to take — lives in the engine, so the same code that
   * told the client which cards were playable is the code that checks this.
   */
  unoPlay(
    roomId: string,
    userId: string,
    cardId: unknown,
    color?: unknown,
    callUno?: unknown,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No UNO match in progress');
    if (typeof cardId !== 'string' || !cardId.trim())
      throw new Error('Pick a card to play');

    const chosen =
      typeof color === 'string' && UNO_COLORS.includes(color as UnoColor)
        ? (color as UnoColor)
        : undefined;

    const result = unoPlay(
      room.uno,
      userId,
      cardId.trim(),
      chosen,
      callUno === true,
    );
    this.emit(room, {
      type: 'uno:play',
      payload: {
        userId,
        card: result.card,
        penalised: result.penalised,
        missedUno: result.missedUno,
      },
    });
    if (room.uno.phase === 'done') this.finish(room);
    return this.view(room, userId);
  }

  /** Take one card from the deck. You may then play it, or pass. */
  unoDraw(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No UNO match in progress');
    const result = unoDraw(room.uno, userId);
    this.emit(room, {
      type: 'uno:draw',
      // The card itself is never broadcast — only the drawer's own view
      // carries it, and that is built per viewer below.
      payload: { userId, playable: result.playable },
    });
    return this.view(room, userId);
  }

  /** End your turn after drawing. */
  unoPass(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No UNO match in progress');
    unoPass(room.uno, userId);
    this.emit(room, { type: 'uno:pass', payload: { userId } });
    return this.view(room, userId);
  }

  /** Shout UNO — allowed from two cards down. */
  unoCall(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No UNO match in progress');
    unoCall(room.uno, userId);
    this.emit(room, { type: 'uno:called', payload: { userId } });
    return this.view(room, userId);
  }

  // ─── Cut ──────────────────────────────────────────────────────────────

  /**
   * Draw the shared card. A fresh number is cut and the same player draws
   * again; a number they have already cut ends their turn — that is the
   * whole game, so there is only this one action.
   */
  cutDraw(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.cut || room.status !== 'playing')
      throw new Error('No Cut match in progress');
    const result = cutDraw(room.cut, userId);
    this.emit(room, {
      type: 'cut:draw',
      payload: { userId, number: result.number, repeat: result.repeat },
    });
    if (room.cut.phase === 'done') this.finish(room);
    return this.view(room, userId);
  }

  // ─── RPS ──────────────────────────────────────────────────────────────

  rpsPick(roomId: string, userId: string, choice: unknown): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.rps || room.status !== 'playing')
      throw new Error('No match in progress');
    if (!isRpsChoice(choice)) throw new Error('Pick stone, paper or scissors');
    const complete = rpsPick(room.rps, userId, choice);
    if (complete) {
      this.emit(room, { type: 'rps:reveal', payload: room.rps.lastResult });
      if (room.rps.phase === 'done') {
        this.finish(room);
      } else {
        this.clearTimer(room);
        room.timer = setTimeout(() => {
          room.timer = null;
          if (room.rps) {
            rpsNextRound(room.rps);
            this.emit(room, { type: 'rps:round' });
          }
        }, RPS_REVEAL_MS);
      }
    } else {
      this.emit(room);
    }
    return this.view(room);
  }

  // ─── Ludo ─────────────────────────────────────────────────────────────

  ludoRoll(roomId: string, userId: string, rng?: () => number): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.ludo || room.status !== 'playing')
      throw new Error('No game in progress');
    const dice = rollDice(rng);
    ludoRoll(room.ludo, userId, dice);
    this.emit(room, { type: 'ludo:roll', payload: { userId, dice } });
    this.afterLudoStep(room);
    return this.view(room);
  }

  ludoMove(roomId: string, userId: string, tokenIndex: number): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.ludo || room.status !== 'playing')
      throw new Error('No game in progress');
    const result = ludoMove(room.ludo, userId, Number(tokenIndex));
    this.emit(room, {
      type: 'ludo:move',
      payload: { userId, tokenIndex, ...result },
    });
    this.afterLudoStep(room);
    return this.view(room);
  }

  private afterLudoStep(room: Room) {
    const st = room.ludo!;
    if (st.phase === 'done') {
      this.finish(room);
      return;
    }
    // Exactly one legal move → play it for them after a short beat.
    if (st.phase === 'move' && st.movable.length === 1) {
      const who = currentPlayer(st);
      const only = st.movable[0];
      this.clearTimer(room);
      room.timer = setTimeout(() => {
        room.timer = null;
        try {
          this.ludoMove(room.id, who, only);
        } catch (err) {
          this.logger.warn(`auto-move failed: ${(err as Error).message}`);
        }
      }, LUDO_AUTO_MOVE_MS);
      this.deadlines.set(room.id, Date.now() + LUDO_AUTO_MOVE_MS);
      return;
    }
    this.armLudoTimer(room);
  }

  /** Turn timer: an idle player gets auto-rolled / auto-moved so the game never stalls. */
  private armLudoTimer(room: Room) {
    this.clearTimer(room);
    const st = room.ludo;
    if (!st || st.phase === 'done') return;
    this.deadlines.set(room.id, Date.now() + LUDO_TURN_MS);
    room.timer = setTimeout(() => {
      room.timer = null;
      const s = room.ludo;
      if (!s || s.phase === 'done') return;
      const who = currentPlayer(s);
      try {
        if (s.phase === 'roll') this.ludoRoll(room.id, who);
        else if (s.phase === 'move') this.ludoMove(room.id, who, s.movable[0]);
      } catch (err) {
        this.logger.warn(`ludo auto-play failed: ${(err as Error).message}`);
      }
    }, LUDO_TURN_MS);
  }

  // ─── internals ────────────────────────────────────────────────────────

  private finish(room: Room, cause: 'complete' | 'forfeit' = 'complete') {
    // Idempotent: a second leave / late engine tick must not write another
    // GameMatch (and another win) for the same finished room.
    if (room.status === 'finished') return;
    this.clearTimer(room);
    this.stopRaceLoop(room.id);
    this.deadlines.delete(room.id);
    room.status = 'finished';
    this.emit(room, { type: 'finished' });
    this.onOrg(room.orgId);
    // Fire-and-forget: a database hiccup must never interrupt the game that
    // just finished for the people in it. The room has already moved on by
    // the time this settles either way.
    void this.persistMatch(room, cause).catch((err) =>
      this.logger.warn(`Could not record ${room.game} match: ${err?.message}`),
    );
  }

  /**
   * Writes one finished match to history. `cause` is the fallback end
   * reason for the games whose own engine has no end-reason concept (RPS,
   * Ludo, Boots, Cut all just reach `phase: 'done'`); Chess, UNO and Race
   * carry a real one from their own state, which takes precedence.
   */
  private async persistMatch(
    room: Room,
    cause: 'complete' | 'forfeit',
  ): Promise<void> {
    if (!this.prisma) return; // unit tests construct GamesService with no DI
    if (room.matchPlayers.length === 0) return; // never actually started / already written
    // Snapshot + clear up front so a second finish/leave cannot double-write
    // the same roster as another win.
    const roster = [...room.matchPlayers];
    room.matchPlayers = [];

    let winnerId: string | null = null;
    let endReason: string | null = null;
    switch (room.game) {
      case 'rps':
        winnerId = room.rps?.winnerId ?? null;
        break;
      case 'ludo':
        winnerId = room.ludo?.winnerId ?? null;
        break;
      case 'boots':
        winnerId = room.boots?.winnerId ?? null;
        break;
      case 'cut':
        winnerId = room.cut?.winnerId ?? null;
        break;
      case 'chess':
        winnerId = room.chess?.winnerId ?? null;
        endReason = room.chess?.endReason ?? null;
        break;
      case 'uno':
        winnerId = room.uno?.winnerId ?? null;
        endReason = room.uno?.endReason ?? null;
        break;
      case 'race':
        // Retired — do not inflate leaderboards with Road Rash results.
        return;
      default:
        break;
    }
    endReason ??= cause;

    const game = GAME_KIND_DB[room.game];
    await this.prisma.gameMatch.create({
      data: {
        orgId: room.orgId,
        game,
        winnerId,
        endReason,
        players: {
          create: roster.map((userId) => ({
            userId,
            orgId: room.orgId,
            game,
            won: userId === winnerId,
          })),
        },
      },
    });
  }

  private destroy(room: Room) {
    this.clearTimer(room);
    this.stopRaceLoop(room.id);
    this.deadlines.delete(room.id);
    this.rooms.delete(room.id);
    for (const [uid, rid] of this.userRoom)
      if (rid === room.id) this.userRoom.delete(uid);
    for (const [uid, rid] of this.spectatorRoom)
      if (rid === room.id) this.spectatorRoom.delete(uid);
    this.onOrg(room.orgId);
  }

  private clearTimer(room: Room) {
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
  }

  private clearDisconnectTimer(userId: string) {
    const t = this.disconnectTimers.get(userId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(userId);
    }
  }

  private emit(room: Room, event?: { type: string; payload?: unknown }) {
    // Once a match is live, every recipient needs their OWN view: Boots
    // hides ship placement, Chess owes each player their correct
    // `yourColor` (a single shared view would quietly hand both players
    // White's perspective), and a spectator must never get a player's view
    // at all. A plain lobby has no such per-viewer state yet, so one shared
    // broadcast is enough there.
    if (room.status === 'playing' || room.status === 'finished') {
      for (const p of room.players) {
        this.onRoom(this.view(room, p.userId), event, p.userId);
      }
      for (const s of room.spectators) {
        this.onRoom(this.view(room, s.userId), event, s.userId);
      }
      return;
    }
    this.onRoom(this.view(room), event);
  }

  private view(room: Room, viewerId?: string): RoomView {
    const spec = GAME_CATALOG[room.game];
    const viewer =
      viewerId ??
      room.players[0]?.userId ??
      room.hostId;
    return {
      id: room.id,
      orgId: room.orgId,
      game: room.game,
      title: spec.title,
      hostId: room.hostId,
      status: room.status,
      players: room.players.map((p) => ({ ...p })),
      spectators: room.spectators.map((s) => ({ ...s })),
      spectatable: spec.spectatable,
      minPlayers: spec.minPlayers,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
      rps: room.rps ? rpsPublicState(room.rps) : null,
      ludo: room.ludo
        ? { ...room.ludo, tokens: cloneTokens(room.ludo.tokens) }
        : null,
      boots: room.boots ? bootsPublicState(room.boots, viewer) : null,
      cut: room.cut ? cutPublicState(room.cut) : null,
      chess: room.chess ? chessPublicState(room.chess, viewer) : null,
      uno: room.uno ? unoPublicState(room.uno, viewer) : null,
      race: room.race ? racePublicState(room.race) : null,
      bootsFleet: room.bootsFleet ? [...room.bootsFleet] : null,
      deadline:
        room.ludo && room.ludo.phase !== 'done'
          ? (this.deadlines.get(room.id) ?? null)
          : null,
    };
  }
}

function cloneTokens(
  tokens: Record<string, number[]>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(tokens)) out[k] = [...v];
  return out;
}
