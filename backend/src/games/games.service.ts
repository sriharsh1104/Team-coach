import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
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
  createUnoState,
  UnoColor,
  UnoPublicState,
  UnoState,
  unoCall,
  unoCatch,
  unoChooseColor,
  unoDraw,
  unoForfeit,
  unoPass,
  unoPlay,
  unoPublicState,
} from './engines/uno.engine';
import {
  ChessMove,
  ChessState,
  ChessPublicState,
  chessForfeit,
  chessMove,
  chessPublicState,
  createChessState,
} from './engines/chess.engine';

/**
 * Taunts players can throw at each other mid-game. A closed set on purpose:
 * this is broadcast to everyone in the room with no moderation in between, so
 * it is four fixed reactions rather than "any string the client sends".
 */
export const GAME_REACTIONS = ['angry', 'loser', 'laughing', 'cool'] as const;
export type GameReaction = (typeof GAME_REACTIONS)[number];

export type GameKind = 'rps' | 'ludo' | 'boots' | 'uno' | 'chess';

export const GAME_CATALOG: Record<
  GameKind,
  { title: string; minPlayers: number; maxPlayers: number }
> = {
  rps: { title: 'Stone Paper Scissors', minPlayers: 2, maxPlayers: 2 },
  ludo: { title: 'Ludo', minPlayers: 2, maxPlayers: 4 },
  boots: { title: 'Boots', minPlayers: 2, maxPlayers: 2 },
  uno: { title: 'Uno', minPlayers: 2, maxPlayers: 6 },
  chess: { title: 'Chess', minPlayers: 2, maxPlayers: 2 },
};

const UNO_COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];

export interface RoomPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  seat: number;
  connected: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

interface Room {
  id: string;
  orgId: string;
  game: GameKind;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  maxPlayers: number;
  createdAt: number;
  rps: RpsState | null;
  ludo: LudoState | null;
  boots: BootsState | null;
  uno: UnoState | null;
  chess: ChessState | null;
  /** Host-chosen boot lengths for Boots (e.g. [5,3,2]). */
  bootsFleet: number[] | null;
  timer: ReturnType<typeof setTimeout> | null;
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
  minPlayers: number;
  maxPlayers: number;
  createdAt: number;
  rps: RpsPublicState | null;
  ludo: LudoState | null;
  /** Viewer-scoped — opponent boots stay hidden until sunk. */
  boots: BootsPublicState | null;
  /** Viewer-scoped — only your hand is full; others are counts. */
  uno: UnoPublicState | null;
  /** Viewer-scoped only for whose turn it is; the board itself is public. */
  chess: ChessPublicState | null;
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

const RPS_REVEAL_MS = 2600;
const LUDO_TURN_MS = 30_000;
const LUDO_AUTO_MOVE_MS = 700;
/** How long a disconnected player keeps their seat before being dropped. */
const DISCONNECT_GRACE_MS = 45_000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

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
  private readonly disconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly deadlines = new Map<string, number>();
  private onRoom: RoomListener = () => {};
  private onOrg: OrgListener = () => {};

  setListeners(onRoom: RoomListener, onOrg: OrgListener) {
    this.onRoom = onRoom;
    this.onOrg = onOrg;
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
    this.leaveRoom(host.userId); // one room at a time
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
      maxPlayers: max,
      createdAt: Date.now(),
      rps: null,
      ludo: null,
      boots: null,
      uno: null,
      chess: null,
      bootsFleet: game === 'boots' ? normalizeFleet(bootsFleet) : null,
      timer: null,
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
      if (room.uno) unoForfeit(room.uno, userId);
      if (room.chess) chessForfeit(room.chess, userId);
      if (
        room.rps?.phase === 'done' ||
        room.ludo?.phase === 'done' ||
        room.boots?.phase === 'done' ||
        room.uno?.phase === 'done' ||
        room.chess?.phase === 'done'
      ) {
        this.finish(room);
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
    if (room.game === 'rps') room.rps = createRpsState([ids[0], ids[1]]);
    if (room.game === 'ludo') {
      room.ludo = createLudoState(ids);
      this.armLudoTimer(room);
    }
    if (room.game === 'boots') {
      room.boots = createBootsState(
        [ids[0], ids[1]],
        room.bootsFleet ?? undefined,
      );
    }
    if (room.game === 'uno') room.uno = createUnoState(ids);
    if (room.game === 'chess') {
      // Seat order decides colour: whoever created the room plays White.
      room.chess = createChessState([ids[0], ids[1]]);
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
    room.uno = null;
    room.chess = null;
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

  bootsFire(roomId: string, userId: string, target: unknown): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.boots || room.status !== 'playing')
      throw new Error('No Boots match in progress');
    const cell = this.parseBootsCell(target);
    fire(room.boots, userId, cell);
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

  // ─── Uno ──────────────────────────────────────────────────────────────

  unoPlay(
    roomId: string,
    userId: string,
    cardId: unknown,
    color?: unknown,
  ): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No Uno match in progress');
    if (typeof cardId !== 'string' || !cardId.trim())
      throw new Error('Pick a card');
    const chosen =
      typeof color === 'string' && UNO_COLORS.includes(color as UnoColor)
        ? (color as UnoColor)
        : undefined;
    unoPlay(room.uno, userId, cardId.trim(), chosen);
    this.emit(room, { type: 'uno:play', payload: { userId, cardId } });
    if (room.uno.phase === 'done') this.finish(room);
    return this.view(room, userId);
  }

  unoChooseColor(roomId: string, userId: string, color: unknown): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No Uno match in progress');
    if (typeof color !== 'string' || !UNO_COLORS.includes(color as UnoColor)) {
      throw new Error('Pick red, yellow, green or blue');
    }
    unoChooseColor(room.uno, userId, color as UnoColor);
    this.emit(room, { type: 'uno:color', payload: { userId, color } });
    if (room.uno.phase === 'done') this.finish(room);
    return this.view(room, userId);
  }

  unoDraw(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No Uno match in progress');
    unoDraw(room.uno, userId);
    this.emit(room, { type: 'uno:draw', payload: { userId } });
    return this.view(room, userId);
  }

  unoPass(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No Uno match in progress');
    unoPass(room.uno, userId);
    this.emit(room, { type: 'uno:pass', payload: { userId } });
    return this.view(room, userId);
  }

  unoCall(roomId: string, userId: string): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No Uno match in progress');
    unoCall(room.uno, userId);
    this.emit(room, { type: 'uno:call', payload: { userId } });
    return this.view(room, userId);
  }

  unoCatch(roomId: string, userId: string, targetId: unknown): RoomView {
    const room = this.rooms.get(roomId);
    if (!room?.uno || room.status !== 'playing')
      throw new Error('No Uno match in progress');
    if (typeof targetId !== 'string' || !targetId.trim())
      throw new Error('Pick who to catch');
    unoCatch(room.uno, userId, targetId.trim());
    this.emit(room, {
      type: 'uno:catch',
      payload: { catcherId: userId, targetId },
    });
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

  private finish(room: Room) {
    this.clearTimer(room);
    this.deadlines.delete(room.id);
    room.status = 'finished';
    this.emit(room, { type: 'finished' });
    this.onOrg(room.orgId);
  }

  private destroy(room: Room) {
    this.clearTimer(room);
    this.deadlines.delete(room.id);
    this.rooms.delete(room.id);
    for (const [uid, rid] of this.userRoom)
      if (rid === room.id) this.userRoom.delete(uid);
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
    // Boots / Uno hide private info — each player gets their own RoomView.
    if (
      (room.boots || room.uno) &&
      (room.status === 'playing' || room.status === 'finished')
    ) {
      for (const p of room.players) {
        this.onRoom(this.view(room, p.userId), event, p.userId);
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
      minPlayers: spec.minPlayers,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
      rps: room.rps ? rpsPublicState(room.rps) : null,
      ludo: room.ludo
        ? { ...room.ludo, tokens: cloneTokens(room.ludo.tokens) }
        : null,
      boots: room.boots ? bootsPublicState(room.boots, viewer) : null,
      uno: room.uno ? unoPublicState(room.uno, viewer) : null,
      chess: room.chess ? chessPublicState(room.chess, viewer) : null,
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
