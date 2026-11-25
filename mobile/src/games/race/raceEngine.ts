/**
 * Road Rash Rush — the simulation, with no rendering in it at all.
 *
 * A lane-based highway racer: four bikes on a four-lane road that sweeps left
 * and right, traffic to dodge, nitro pads to grab, and punches and kicks to
 * knock rivals off their bikes. First to the finish line wins.
 *
 * Keeping the whole thing as a plain state object stepped by `raceStep` means
 * the GL scene only ever reads positions — it never owns game rules — and the
 * rules can be tested without a renderer.
 *
 * Units are the virtual canvas's pixels and one "frame" at 60fps, which is how
 * the original arcade build was tuned. `dt` is in frames (1 = one 60fps tick),
 * so a slow device moves the same distance in fewer, larger steps.
 */

export type RaceMode = '1p' | '2p' | '3p' | '4p';
export type AttackType = 'punch' | 'kick';

export type Biker = {
  id: number;
  isHuman: boolean;
  name: string;
  /** Short name for the HUD and the tag above the bike. */
  tag: string;
  lane: number;
  /** Smoothed screen x, eased towards the lane centre. */
  x: number;
  lean: number;
  speed: number;
  dist: number;
  hp: number;
  nitro: number;
  boostTimer: number;
  attackState: AttackType | null;
  attackTimer: number;
  attackDir: 1 | -1;
  wipeoutTimer: number;
  color: string;
  helmet: string;
  /** Set the frame they cross the line, so places can be ordered. */
  finishedAt: number | null;
};

export type TrafficCar = { lane: number; y: number; speed: number; color: string };
export type NitroPad = { lane: number; y: number };
export type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

/** Things the screen wants to react to — sound, haptics, a toast. */
export type RaceEvent =
  | { type: 'hit'; attacker: number; target: number; move: AttackType }
  | { type: 'wipeout'; biker: number }
  | { type: 'crash'; biker: number }
  | { type: 'nitro'; biker: number }
  | { type: 'finish'; biker: number };

export type RaceState = {
  mode: RaceMode;
  /** Virtual canvas size the whole simulation is laid out in. */
  cw: number;
  ch: number;
  bikers: Biker[];
  traffic: TrafficCar[];
  pads: NitroPad[];
  sparks: Spark[];
  roadOffset: number;
  roadCurve: number;
  targetCurve: number;
  curveChangeTimer: number;
  finished: boolean;
  winnerId: number | null;
  /** Frames elapsed — also used to order finishers. */
  clock: number;
  events: RaceEvent[];
};

/** Four times the original lap: a race that lasts about half a minute. */
export const FINISH_DIST = 18500;
export const LANES = 4;
/** How far up the screen one unit of distance behind the camera puts you. */
export const DIST_TO_PX = 0.58;
/** The camera leader sits this far up from the bottom edge. */
export const CAM_OFFSET = 115;
const MAX_ROAD_W = 460;
const CRUISE_HUMAN = 8.8;
const SPEED_CAP = 14.5;

const PRESETS = [
  { tag: 'VIPER', color: '#ef4444', helmet: '#fbbf24' },
  { tag: 'RAZOR', color: '#3b82f6', helmet: '#38bdf8' },
  { tag: 'SLATER', color: '#22c55e', helmet: '#fde047' },
  { tag: 'BRAWLER', color: '#a855f7', helmet: '#f472b6' },
];

const TRAFFIC_COLORS = ['#f59e0b', '#64748b', '#ec4899', '#14b8a6'];

export function humansIn(mode: RaceMode): number {
  return Number(mode[0]);
}

/** Width of the road at the given canvas width. */
export function roadWidth(cw: number): number {
  return Math.min(cw * 0.92, MAX_ROAD_W);
}

/**
 * How far the road has slid sideways at this height of the screen. The bend
 * is squared so it is zero at the bottom (where you are) and strongest at
 * the horizon, which is what sells it as perspective rather than a slide.
 */
export function curveOffsetAtY(state: RaceState, y: number): number {
  const normY = 1 - Math.max(0, Math.min(1, y / state.ch));
  return state.roadCurve * normY * normY * Math.min(state.cw * 0.34, 155);
}

export function laneCenterX(state: RaceState, lane: number, y: number): number {
  const roadW = roadWidth(state.cw);
  const roadLeft = (state.cw - roadW) / 2 + curveOffsetAtY(state, y);
  const laneW = roadW / LANES;
  return roadLeft + laneW * lane + laneW / 2;
}

/** The human who is furthest ahead — the camera rides with them. */
export function cameraLeader(state: RaceState): Biker {
  const humans = state.bikers.filter((b) => b.isHuman);
  return humans.reduce((best, b) => (b.dist > best.dist ? b : best), humans[0] ?? state.bikers[0]);
}

export function screenYOf(state: RaceState, biker: Biker, leader: Biker): number {
  return state.ch - CAM_OFFSET - (biker.dist - leader.dist) * DIST_TO_PX;
}

function spawnTraffic(state: RaceState, y: number, rng: () => number): TrafficCar {
  return {
    lane: Math.floor(rng() * LANES),
    y,
    speed: 3.3 + rng() * 1.5,
    color: TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)],
  };
}

export function createRaceState(
  mode: RaceMode,
  cw: number,
  ch: number,
  rng: () => number = Math.random,
): RaceState {
  const humans = humansIn(mode);
  const state: RaceState = {
    mode,
    cw,
    ch,
    bikers: PRESETS.map((cfg, idx) => ({
      id: idx,
      isHuman: idx < humans,
      name: idx < humans ? `P${idx + 1} ${cfg.tag}` : `${cfg.tag} (CPU)`,
      tag: cfg.tag,
      lane: idx,
      x: 0,
      lean: 0,
      speed: 7.5,
      // The CPU starts a little up the road so there is someone to chase.
      dist: idx < humans ? 0 : idx * 60,
      hp: 100,
      nitro: 100,
      boostTimer: 0,
      attackState: null,
      attackTimer: 0,
      attackDir: idx % 2 === 0 ? 1 : -1,
      wipeoutTimer: 0,
      color: cfg.color,
      helmet: cfg.helmet,
      finishedAt: null,
    })),
    traffic: [],
    pads: [],
    sparks: [],
    roadOffset: 0,
    roadCurve: 0,
    targetCurve: 0,
    curveChangeTimer: 140,
    finished: false,
    winnerId: null,
    clock: 0,
    events: [],
  };
  for (let i = 0; i < 6; i++) state.traffic.push(spawnTraffic(state, -220 - i * 260, rng));
  for (let i = 0; i < 4; i++) {
    state.pads.push({ lane: Math.floor(rng() * LANES), y: -350 - i * 420 });
  }
  return state;
}

/** Resize without losing the race — the canvas settles a frame or two in. */
export function resizeRace(state: RaceState, cw: number, ch: number): void {
  state.cw = cw;
  state.ch = ch;
}

export function raceSteer(state: RaceState, playerIdx: number, dir: -1 | 1): void {
  if (state.finished) return;
  const b = state.bikers[playerIdx];
  if (!b || b.wipeoutTimer > 0) return;
  b.lane = Math.max(0, Math.min(LANES - 1, b.lane + dir));
  b.lean = dir * 0.32;
}

export function raceNitro(state: RaceState, playerIdx: number): boolean {
  if (state.finished) return false;
  const b = state.bikers[playerIdx];
  if (!b || b.wipeoutTimer > 0 || b.nitro < 25 || b.boostTimer > 0) return false;
  b.nitro -= 30;
  b.boostTimer = 70;
  state.events.push({ type: 'nitro', biker: b.id });
  return true;
}

/**
 * Throw a punch or a kick at whoever is alongside.
 *
 * A kick puts the rival straight on the tarmac; a punch takes a chunk of
 * their health and shoves them a lane sideways, which near the edge of the
 * road is its own punishment.
 */
export function raceAttack(
  state: RaceState,
  attackerIdx: number,
  move: AttackType = 'kick',
): void {
  if (state.finished) return;
  const attacker = state.bikers[attackerIdx];
  if (!attacker || attacker.wipeoutTimer > 0 || attacker.attackTimer > 0) return;

  let target: Biker | null = null;
  let best = Infinity;
  for (const other of state.bikers) {
    if (other.id === attacker.id || other.wipeoutTimer > 0) continue;
    const dY = Math.abs(other.dist - attacker.dist);
    const dLane = Math.abs(other.lane - attacker.lane);
    if (dY < 105 && dLane <= 1 && dY < best) {
      best = dY;
      target = other;
    }
  }

  attacker.attackState = move;
  attacker.attackTimer = 20;
  attacker.attackDir = target
    ? target.lane >= attacker.lane
      ? 1
      : -1
    : attacker.lane < 2
      ? 1
      : -1;
  attacker.lean = attacker.attackDir * 0.38;

  if (!target) return;

  target.hp = Math.max(0, target.hp - (move === 'kick' ? 65 : 35));
  target.speed = Math.max(2.5, target.speed - 3.5);
  target.lane = Math.max(0, Math.min(LANES - 1, target.lane + attacker.attackDir));
  state.events.push({ type: 'hit', attacker: attacker.id, target: target.id, move });

  const leader = cameraLeader(state);
  const ty = screenYOf(state, target, leader);
  const tx = laneCenterX(state, target.lane, ty);
  burst(state, tx, ty, move === 'kick' ? '#fb7185' : '#facc15', 16);

  // A kick is a knockdown outright; a punch only finishes the job at zero.
  if (move === 'kick' || target.hp <= 0) {
    wipeout(state, target, 85);
  }
}

function wipeout(state: RaceState, b: Biker, frames: number) {
  b.wipeoutTimer = frames;
  b.hp = 100;
  b.speed = 1.6;
  state.events.push({ type: 'wipeout', biker: b.id });
}

function burst(state: RaceState, x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    state.sparks.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 20,
      color,
    });
  }
  // The pool is fixed in the renderer; older sparks make way for newer ones.
  if (state.sparks.length > 48) state.sparks.splice(0, state.sparks.length - 48);
}

/**
 * Advance the world by `dt` frames.
 *
 * Everything scrolls relative to the camera leader rather than to player one,
 * so in a 2–4 player game the road, the traffic and the pads all move with
 * whoever is actually on screen.
 */
export function raceStep(state: RaceState, dt: number, rng: () => number = Math.random): void {
  if (state.finished) {
    stepSparks(state, dt);
    return;
  }
  state.clock += dt;

  // Sweeping left/right bends, re-aimed every couple of seconds.
  state.curveChangeTimer -= dt;
  if (state.curveChangeTimer <= 0) {
    const bends = [-0.95, -0.55, 0, 0.55, 0.95];
    state.targetCurve = bends[Math.floor(rng() * bends.length)];
    state.curveChangeTimer = 150 + Math.floor(rng() * 90);
  }
  state.roadCurve += (state.targetCurve - state.roadCurve) * 0.015 * dt;

  const leader = cameraLeader(state);

  for (const b of state.bikers) {
    const screenY = screenYOf(state, b, leader);
    const targetX = laneCenterX(state, b.lane, Math.max(80, Math.min(state.ch - 80, screenY)));
    if (b.x === 0) b.x = targetX;
    b.x += (targetX - b.x) * Math.min(1, 0.24 * dt);

    const targetLean = state.roadCurve * 0.22;
    b.lean += (targetLean - b.lean) * Math.min(1, 0.14 * dt);

    if (b.attackTimer > 0) b.attackTimer = Math.max(0, b.attackTimer - dt);
    if (b.attackTimer === 0) b.attackState = null;

    if (b.wipeoutTimer > 0) {
      b.wipeoutTimer = Math.max(0, b.wipeoutTimer - dt);
      b.speed = 1.8;
    } else if (b.boostTimer > 0) {
      b.boostTimer = Math.max(0, b.boostTimer - dt);
      b.speed = Math.min(SPEED_CAP, b.speed + 0.4 * dt);
    } else {
      const cruise = b.isHuman ? CRUISE_HUMAN : 8.1 + (b.id % 2) * 0.35;
      b.speed += (cruise - b.speed) * Math.min(1, 0.04 * dt);
      b.nitro = Math.min(100, b.nitro + 0.14 * dt);
    }

    b.dist += b.speed * dt;

    if (!b.isHuman && b.wipeoutTimer <= 0) {
      stepAi(state, b, rng, dt);
    }

    if (b.dist >= FINISH_DIST && b.finishedAt === null) {
      b.finishedAt = state.clock;
      if (!state.finished) {
        state.finished = true;
        state.winnerId = b.id;
        state.events.push({ type: 'finish', biker: b.id });
      }
    }
  }

  state.roadOffset = (state.roadOffset + leader.speed * 1.55 * dt) % 48;

  stepPads(state, leader, dt, rng);
  stepTraffic(state, leader, dt, rng);
  stepSparks(state, dt);
}

/** CPU riders dodge what is in front of them and swing at anyone alongside. */
function stepAi(state: RaceState, b: Biker, rng: () => number, dt: number) {
  const danger = state.traffic.find(
    (t) => t.lane === b.lane && t.y > state.ch - 270 && t.y < state.ch - 45,
  );
  if (danger) {
    const safe = [0, 1, 2, 3].filter((l) => l !== b.lane);
    b.lane = safe[Math.floor(rng() * safe.length)];
    return;
  }
  if (rng() < 0.03 * dt) {
    const near = state.bikers.find(
      (h) => h.isHuman && Math.abs(h.dist - b.dist) < 85 && Math.abs(h.lane - b.lane) <= 1,
    );
    if (near) raceAttack(state, b.id, 'punch');
  }
}

function stepPads(state: RaceState, leader: Biker, dt: number, rng: () => number) {
  for (const pad of state.pads) {
    pad.y += leader.speed * 1.25 * dt;
    if (pad.y > state.ch + 60) {
      pad.y = -240 - rng() * 320;
      pad.lane = Math.floor(rng() * LANES);
    }
    for (const b of state.bikers) {
      if (b.wipeoutTimer > 0) continue;
      const by = screenYOf(state, b, leader);
      const px = laneCenterX(state, pad.lane, pad.y);
      if (Math.abs(b.x - px) < 34 && Math.abs(by - pad.y) < 44) {
        b.nitro = Math.min(100, b.nitro + 50);
        b.boostTimer = 55;
        pad.y = -320 - rng() * 240;
        state.events.push({ type: 'nitro', biker: b.id });
      }
    }
  }
}

function stepTraffic(state: RaceState, leader: Biker, dt: number, rng: () => number) {
  for (const car of state.traffic) {
    car.y += (leader.speed - car.speed) * 1.15 * dt;
    if (car.y > state.ch + 95) {
      car.y = -130 - rng() * 140;
      car.lane = Math.floor(rng() * LANES);
    }
    for (const b of state.bikers) {
      if (b.wipeoutTimer > 0) continue;
      const by = screenYOf(state, b, leader);
      const cx = laneCenterX(state, car.lane, car.y);
      if (Math.abs(b.x - cx) < 32 && Math.abs(by - car.y) < 56) {
        wipeout(state, b, 60);
        state.events.push({ type: 'crash', biker: b.id });
        car.y = -190;
      }
    }
  }
}

function stepSparks(state: RaceState, dt: number) {
  for (const sp of state.sparks) {
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.life -= dt;
  }
  state.sparks = state.sparks.filter((sp) => sp.life > 0);
}

/** Running order, leader first — what the HUD puts next to each name. */
export function standings(state: RaceState): Biker[] {
  return [...state.bikers].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
    }
    return b.dist - a.dist;
  });
}

/** Speed in the units the HUD shows. */
export function kmh(b: Biker): number {
  return Math.round(b.speed * 25);
}

/** Drain the event queue — the screen reacts to these once, then they're gone. */
export function takeEvents(state: RaceState): RaceEvent[] {
  if (state.events.length === 0) return [];
  const out = state.events;
  state.events = [];
  return out;
}
