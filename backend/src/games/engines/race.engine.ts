/**
 * Road Rash Rush — a four-lane bike combat race, for 1–4 players.
 *
 * Unlike every other game here this one is real time: there are no turns, the
 * server steps the world on a timer and players send inputs whenever they
 * press something. The authoritative simulation lives here so that four
 * phones with four different screen sizes all race in the same world.
 *
 * That is also why nothing in this file knows about pixels. A rider is a
 * `lane` (0–3) and a `dist` along the track; so is every traffic car and
 * nitro pad. How far up the screen that lands, and how the road bends, is the
 * renderer's business — and because the bend is a pure function of distance
 * and the room's seed (`curveAt`), every client draws the identical road
 * without a single byte being synced for it.
 */

export type RaceLane = 0 | 1 | 2 | 3;
export type AttackType = 'punch' | 'kick';
export type RacePhase = 'play' | 'done';
export type RaceEndReason = 'finish' | 'forfeit';

export type RaceBiker = {
  seat: number;
  /** null for a CPU rider. */
  userId: string | null;
  name: string;
  tag: string;
  color: string;
  helmet: string;
  lane: number;
  dist: number;
  speed: number;
  hp: number;
  nitro: number;
  boostTimer: number;
  attack: AttackType | null;
  attackTimer: number;
  attackDir: 1 | -1;
  wipeoutTimer: number;
  /** Tick they crossed the line, so places can be ordered. */
  finishedAt: number | null;
};

export type RaceCar = { lane: number; dist: number; speed: number };
export type RacePad = { lane: number; dist: number };

/** Things the clients turn into a noise, a rumble or a shower of sparks. */
export type RaceEvent =
  | { type: 'swing'; seat: number; move: AttackType }
  | { type: 'hit'; seat: number; target: number; move: AttackType }
  | { type: 'wipeout'; seat: number }
  | { type: 'crash'; seat: number }
  | { type: 'nitro'; seat: number }
  | { type: 'finish'; seat: number };

export type RaceState = {
  seed: number;
  bikers: RaceBiker[];
  traffic: RaceCar[];
  pads: RacePad[];
  phase: RacePhase;
  winnerId: string | null;
  winnerSeat: number | null;
  endReason: RaceEndReason | null;
  /** Ticks since the lights went out. */
  clock: number;
  events: RaceEvent[];
  version: number;
};

export const RACE_MIN_PLAYERS = 1;
export const RACE_MAX_PLAYERS = 4;
export const RACE_LANES = 4;
export const FINISH_DIST = 18500;
/** How long a race may run before it is called, in ticks of `raceStep`. */
export const RACE_MAX_TICKS = 60 * 60 * 6;

const TRAFFIC_COUNT = 8;
const PAD_COUNT = 4;
/** Same lane and this close along the track is a collision. */
const CRASH_GAP = 58;
/** A rival this close, in this lane or the next, is in range of a boot. */
const STRIKE_GAP = 105;
const PAD_GAP = 46;
const CRUISE_HUMAN = 8.8;
const SPEED_CAP = 14.5;

const PRESETS = [
  { tag: 'VIPER', color: '#ef4444', helmet: '#fbbf24' },
  { tag: 'RAZOR', color: '#3b82f6', helmet: '#38bdf8' },
  { tag: 'SLATER', color: '#22c55e', helmet: '#fde047' },
  { tag: 'BRAWLER', color: '#a855f7', helmet: '#f472b6' },
];

/**
 * The highway's bend at a given distance, from −1 (hard left) to +1.
 *
 * Three sine waves at unrelated wavelengths, offset by the room's seed: it
 * never repeats in a way you would notice, and any client can evaluate it for
 * any distance without being told anything.
 */
export function curveAt(seed: number, dist: number): number {
  const s = seed * 0.0137;
  const a = Math.sin(dist / 620 + s);
  const b = Math.sin(dist / 1310 + s * 2.3);
  const c = Math.sin(dist / 2630 + s * 4.1);
  return Math.max(-1, Math.min(1, a * 0.5 + b * 0.33 + c * 0.22));
}

/** Deterministic per-room randomness for spawns, so a replay matches. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createRaceState(
  playerIds: string[],
  playerNames: Record<string, string> = {},
  seed: number = Math.floor(Math.random() * 1e9),
): RaceState {
  if (
    playerIds.length < RACE_MIN_PLAYERS ||
    playerIds.length > RACE_MAX_PLAYERS
  ) {
    throw new Error(
      `Road Rash needs ${RACE_MIN_PLAYERS}–${RACE_MAX_PLAYERS} riders`,
    );
  }
  const rng = makeRng(seed);
  const state: RaceState = {
    seed,
    bikers: PRESETS.map((cfg, seat) => {
      const userId = playerIds[seat] ?? null;
      const human = userId !== null;
      return {
        seat,
        userId,
        name: human
          ? playerNames[userId]?.trim() || `P${seat + 1}`
          : `${cfg.tag} (CPU)`,
        tag: human ? `P${seat + 1}` : cfg.tag,
        color: cfg.color,
        helmet: cfg.helmet,
        lane: seat,
        // CPU riders start a little up the road, so there is always someone
        // to chase rather than an empty highway.
        dist: human ? 0 : seat * 60,
        speed: 7.5,
        hp: 100,
        nitro: 100,
        boostTimer: 0,
        attack: null,
        attackTimer: 0,
        attackDir: seat % 2 === 0 ? 1 : -1,
        wipeoutTimer: 0,
        finishedAt: null,
      };
    }),
    traffic: [],
    pads: [],
    phase: 'play',
    winnerId: null,
    winnerSeat: null,
    endReason: null,
    clock: 0,
    events: [],
    version: 1,
  };

  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    state.traffic.push({
      lane: Math.floor(rng() * RACE_LANES),
      dist: 420 + i * 260 + rng() * 120,
      speed: 3.3 + rng() * 1.5,
    });
  }
  for (let i = 0; i < PAD_COUNT; i++) {
    state.pads.push({
      lane: Math.floor(rng() * RACE_LANES),
      dist: 600 + i * 520 + rng() * 260,
    });
  }
  return state;
}

export function bikerOf(
  state: RaceState,
  userId: string,
): RaceBiker | undefined {
  return state.bikers.find((b) => b.userId === userId);
}

/** The rider in front — the one every client's camera rides with. */
export function raceLeader(state: RaceState): RaceBiker {
  return state.bikers.reduce(
    (best, b) => (b.dist > best.dist ? b : best),
    state.bikers[0],
  );
}

export function raceSteer(state: RaceState, userId: string, dir: -1 | 1): void {
  if (state.phase !== 'play') return;
  const b = bikerOf(state, userId);
  if (!b || b.wipeoutTimer > 0) return;
  b.lane = Math.max(0, Math.min(RACE_LANES - 1, b.lane + dir));
  state.version++;
}

export function raceNitro(state: RaceState, userId: string): void {
  if (state.phase !== 'play') return;
  const b = bikerOf(state, userId);
  if (!b || b.wipeoutTimer > 0 || b.nitro < 25 || b.boostTimer > 0) return;
  b.nitro -= 30;
  b.boostTimer = 70;
  state.events.push({ type: 'nitro', seat: b.seat });
  state.version++;
}

export function raceAttack(
  state: RaceState,
  userId: string,
  move: AttackType,
): void {
  if (state.phase !== 'play') return;
  const b = bikerOf(state, userId);
  if (!b) return;
  swing(state, b, move);
}

/** Put a rider on the tarmac. Callers raise the event that fits the cause. */
function wipeout(b: RaceBiker, frames: number) {
  b.wipeoutTimer = frames;
  b.hp = 100;
  b.speed = 1.6;
}

/**
 * Throw a punch or a kick at whoever is alongside.
 *
 * A kick puts the rival straight down; a punch takes a chunk of their health
 * and shoves them a lane sideways, which near the kerb is its own punishment.
 */
function swing(state: RaceState, attacker: RaceBiker, move: AttackType) {
  if (attacker.wipeoutTimer > 0 || attacker.attackTimer > 0) return;

  let target: RaceBiker | null = null;
  let best = Infinity;
  for (const other of state.bikers) {
    if (other.seat === attacker.seat || other.wipeoutTimer > 0) continue;
    const gap = Math.abs(other.dist - attacker.dist);
    if (
      gap < STRIKE_GAP &&
      Math.abs(other.lane - attacker.lane) <= 1 &&
      gap < best
    ) {
      best = gap;
      target = other;
    }
  }

  attacker.attack = move;
  attacker.attackTimer = 20;
  attacker.attackDir = target
    ? target.lane >= attacker.lane
      ? 1
      : -1
    : attacker.lane < 2
      ? 1
      : -1;
  state.events.push({ type: 'swing', seat: attacker.seat, move });
  state.version++;

  if (!target) return;

  target.hp = Math.max(0, target.hp - (move === 'kick' ? 65 : 35));
  target.speed = Math.max(2.5, target.speed - 3.5);
  target.lane = Math.max(
    0,
    Math.min(RACE_LANES - 1, target.lane + attacker.attackDir),
  );
  state.events.push({
    type: 'hit',
    seat: attacker.seat,
    target: target.seat,
    move,
  });

  if (move === 'kick' || target.hp <= 0) {
    wipeout(target, 85);
    state.events.push({ type: 'wipeout', seat: target.seat });
  }
}

/** CPU riders dodge what is in front of them and swing at anyone alongside. */
function stepCpu(
  state: RaceState,
  b: RaceBiker,
  dt: number,
  rng: () => number,
) {
  const danger = state.traffic.find(
    (t) => t.lane === b.lane && t.dist > b.dist && t.dist - b.dist < 240,
  );
  if (danger) {
    const safe = [0, 1, 2, 3].filter((l) => l !== b.lane);
    b.lane = safe[Math.floor(rng() * safe.length)];
    return;
  }
  if (rng() < 0.03 * dt) {
    const near = state.bikers.find(
      (h) =>
        h.seat !== b.seat &&
        Math.abs(h.dist - b.dist) < 85 &&
        Math.abs(h.lane - b.lane) <= 1,
    );
    if (near) swing(state, b, 'punch');
  }
}

/**
 * Advance the world by `dt` sixtieths of a second.
 *
 * The server ticks at a lower rate than that and passes the real elapsed
 * frames, so the physics are the same whatever the tick rate ends up being.
 */
export function raceStep(
  state: RaceState,
  dt: number,
  rng: () => number = Math.random,
): void {
  if (state.phase !== 'play') return;
  state.clock += dt;

  for (const b of state.bikers) {
    if (b.attackTimer > 0) b.attackTimer = Math.max(0, b.attackTimer - dt);
    if (b.attackTimer === 0) b.attack = null;

    if (b.wipeoutTimer > 0) {
      b.wipeoutTimer = Math.max(0, b.wipeoutTimer - dt);
      b.speed = 1.8;
    } else if (b.boostTimer > 0) {
      b.boostTimer = Math.max(0, b.boostTimer - dt);
      b.speed = Math.min(SPEED_CAP, b.speed + 0.4 * dt);
    } else {
      const cruise = b.userId ? CRUISE_HUMAN : 8.1 + (b.seat % 2) * 0.35;
      b.speed += (cruise - b.speed) * Math.min(1, 0.04 * dt);
      b.nitro = Math.min(100, b.nitro + 0.14 * dt);
    }

    b.dist += b.speed * dt;
    if (!b.userId && b.wipeoutTimer <= 0) stepCpu(state, b, dt, rng);

    if (b.dist >= FINISH_DIST && b.finishedAt === null) {
      b.finishedAt = state.clock;
      state.events.push({ type: 'finish', seat: b.seat });
      if (state.phase === 'play') {
        state.phase = 'done';
        state.winnerSeat = b.seat;
        state.winnerId = b.userId;
        state.endReason = 'finish';
      }
    }
  }

  const leader = raceLeader(state);
  // Cars and pads are recycled once the *last* rider is past them, not the
  // first: measuring from the leader snatches them away from under whoever
  // is trailing, who is exactly the rider who still has to deal with them.
  const tail = state.bikers.reduce(
    (min, b) => (b.dist < min ? b.dist : min),
    Infinity,
  );

  for (const car of state.traffic) {
    car.dist += car.speed * dt;
    // Once a car is well behind the field it is recycled up the road.
    if (car.dist < tail - 200) {
      car.dist = leader.dist + 520 + rng() * 520;
      car.lane = Math.floor(rng() * RACE_LANES);
      car.speed = 3.3 + rng() * 1.5;
    }
    for (const b of state.bikers) {
      if (b.wipeoutTimer > 0 || b.finishedAt !== null) continue;
      if (b.lane === car.lane && Math.abs(b.dist - car.dist) < CRASH_GAP) {
        wipeout(b, 60);
        state.events.push({ type: 'crash', seat: b.seat });
        car.dist = leader.dist + 600;
      }
    }
  }

  for (const pad of state.pads) {
    if (pad.dist < tail - 150) {
      pad.dist = leader.dist + 620 + rng() * 700;
      pad.lane = Math.floor(rng() * RACE_LANES);
    }
    for (const b of state.bikers) {
      if (b.wipeoutTimer > 0 || b.finishedAt !== null) continue;
      if (b.lane === pad.lane && Math.abs(b.dist - pad.dist) < PAD_GAP) {
        b.nitro = Math.min(100, b.nitro + 50);
        b.boostTimer = 55;
        pad.dist = leader.dist + 700 + rng() * 500;
        pad.lane = Math.floor(rng() * RACE_LANES);
        state.events.push({ type: 'nitro', seat: b.seat });
      }
    }
  }

  // A race nobody can finish (everyone disconnected mid-air, say) still ends.
  if (state.clock > RACE_MAX_TICKS && state.phase === 'play') {
    const front = raceLeader(state);
    state.phase = 'done';
    state.winnerSeat = front.seat;
    state.winnerId = front.userId;
    state.endReason = 'finish';
  }
  state.version++;
}

export function raceForfeit(state: RaceState, userId: string): void {
  if (state.phase === 'done') return;
  const b = bikerOf(state, userId);
  if (!b) return;
  // Their bike carries on as a CPU rather than vanishing from the road.
  b.userId = null;
  b.name = `${b.tag} (left)`;

  const humans = state.bikers.filter((x) => x.userId !== null);
  if (humans.length === 0) {
    state.phase = 'done';
    state.winnerSeat = null;
    state.winnerId = null;
    state.endReason = 'forfeit';
  } else if (humans.length === 1) {
    state.phase = 'done';
    state.winnerSeat = humans[0].seat;
    state.winnerId = humans[0].userId;
    state.endReason = 'forfeit';
  }
  state.version++;
}

/** Running order, leader first. */
export function raceStandings(state: RaceState): RaceBiker[] {
  return [...state.bikers].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
    }
    return b.dist - a.dist;
  });
}

// ── Wire formats ───────────────────────────────────────────────────────────

/**
 * The parts that never change mid-race: who is in which seat, their colours,
 * and the seed the road is drawn from. Rides along on the normal room view.
 */
export type RacePublicState = {
  seed: number;
  finishDist: number;
  phase: RacePhase;
  winnerId: string | null;
  winnerSeat: number | null;
  endReason: RaceEndReason | null;
  seats: {
    seat: number;
    userId: string | null;
    name: string;
    tag: string;
    color: string;
    helmet: string;
  }[];
};

/**
 * One frame of the world, sent ~20 times a second on its own channel.
 *
 * Deliberately terse: a full room view at this rate would be tens of
 * kilobytes a second per player. Arrays, not objects — `b` is one row per
 * rider, `c` per traffic car, `p` per nitro pad.
 */
export type RaceTick = {
  t: number;
  /** [lane, dist, hp, nitro, speed, flags] — flags: 1 boost, 2 down, 4 kick, 8 punch. */
  b: number[][];
  c: number[][];
  p: number[][];
  ev: RaceEvent[];
  done: 0 | 1;
};

export function racePublicState(state: RaceState): RacePublicState {
  return {
    seed: state.seed,
    finishDist: FINISH_DIST,
    phase: state.phase,
    winnerId: state.winnerId,
    winnerSeat: state.winnerSeat,
    endReason: state.endReason,
    seats: state.bikers.map((b) => ({
      seat: b.seat,
      userId: b.userId,
      name: b.name,
      tag: b.tag,
      color: b.color,
      helmet: b.helmet,
    })),
  };
}

export function raceTick(state: RaceState): RaceTick {
  const events = state.events;
  state.events = [];
  return {
    t: Math.round(state.clock),
    b: state.bikers.map((b) => [
      b.lane,
      Math.round(b.dist * 10) / 10,
      Math.round(b.hp),
      Math.round(b.nitro),
      Math.round(b.speed * 100) / 100,
      (b.boostTimer > 0 ? 1 : 0) |
        (b.wipeoutTimer > 0 ? 2 : 0) |
        (b.attack === 'kick' ? 4 : 0) |
        (b.attack === 'punch' ? 8 : 0),
    ]),
    c: state.traffic.map((c) => [c.lane, Math.round(c.dist * 10) / 10]),
    p: state.pads.map((p) => [p.lane, Math.round(p.dist * 10) / 10]),
    ev: events,
    done: state.phase === 'done' ? 1 : 0,
  };
}
