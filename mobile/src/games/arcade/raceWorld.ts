import {
  RaceEvent,
  RACE_FLAG_BOOST,
  RACE_FLAG_DOWN,
  RACE_FLAG_KICK,
  RACE_FLAG_PUNCH,
  RaceAction,
  RaceTick,
} from '../../api/games';

/**
 * The client's picture of a race that is actually running on the server.
 *
 * Ticks arrive twenty times a second; the screen draws sixty. Between the two
 * sits this: it keeps the last two ticks and reads a point between them, so
 * bikes glide instead of stepping. Rendering is held one tick behind the
 * newest state — about 50ms — which costs nothing noticeable in a lane-based
 * racer and means there is always a tick on each side to read between.
 *
 * Your own lane change is applied the moment you press, before the server has
 * said anything, because waiting a round trip to move one lane feels broken.
 * The next tick overwrites it, so a press the server rejected simply snaps
 * back rather than desyncing anything.
 */

export type RaceRider = {
  lane: number;
  dist: number;
  hp: number;
  nitro: number;
  speed: number;
  boosting: boolean;
  down: boolean;
  attack: 'kick' | 'punch' | null;
};

export type RaceObject = { lane: number; dist: number };

export type RaceView = {
  riders: RaceRider[];
  cars: RaceObject[];
  pads: RaceObject[];
  /** Whose eyes we are looking through: your own bike, or the leader's. */
  cameraDist: number;
  done: boolean;
  /** True until the first tick lands. */
  empty: boolean;
};

/** Render this far behind the newest tick, in milliseconds. */
const DELAY_MS = 55;
/** Beyond this the connection is treated as stalled rather than interpolated. */
const STALE_MS = 600;

const EMPTY_FX: RaceEvent[] = [];

const LANE_INDEX = 0;
const DIST_INDEX = 1;
const HP_INDEX = 2;
const NITRO_INDEX = 3;
const SPEED_INDEX = 4;
const FLAGS_INDEX = 5;

function blankRider(): RaceRider {
  return {
    lane: 0,
    dist: 0,
    hp: 100,
    nitro: 100,
    speed: 0,
    boosting: false,
    down: false,
    attack: null,
  };
}

export class RaceWorld {
  private prev: RaceTick | null = null;
  private next: RaceTick | null = null;
  private prevAt = 0;
  private nextAt = 0;
  /** Lane the local rider has pressed for but not yet had confirmed. */
  private predictedLane: number | null = null;
  private seat = -1;
  /**
   * Events waiting to be turned into sparks. The screen gets its own copy for
   * sound and haptics; the scene drains this one, because only the scene
   * knows where on the screen a rider actually is.
   */
  private fx: RaceEvent[] = [];

  /** The view object is reused every frame — nothing allocates at 60fps. */
  private readonly view: RaceView = {
    riders: [blankRider(), blankRider(), blankRider(), blankRider()],
    cars: [],
    pads: [],
    cameraDist: 0,
    done: false,
    empty: true,
  };

  constructor(seat: number) {
    this.seat = seat;
  }

  setSeat(seat: number): void {
    this.seat = seat;
    this.predictedLane = null;
  }

  /** Feed a tick in; hands back the events it carried, to fire once. */
  push(tick: RaceTick, now = Date.now()): RaceTick['ev'] {
    this.prev = this.next ?? tick;
    this.prevAt = this.nextAt || now;
    this.next = tick;
    this.nextAt = now;
    // The server has spoken: whatever we guessed about our own lane is moot.
    this.predictedLane = null;
    if (tick.ev.length > 0) {
      this.fx.push(...tick.ev);
      if (this.fx.length > 24) this.fx.splice(0, this.fx.length - 24);
    }
    return tick.ev;
  }

  /** Hand the visual-effect queue to the renderer, once. */
  takeFx(): RaceEvent[] {
    if (this.fx.length === 0) return EMPTY_FX;
    const out = this.fx;
    this.fx = [];
    return out;
  }

  /**
   * Move the local rider now, before the server confirms it. Returns the lane
   * it believes it is in so the caller can keep its own UI honest.
   */
  predict(action: RaceAction): void {
    if (this.seat < 0 || !this.next) return;
    if (action !== 'left' && action !== 'right') return;
    const row = this.next.b[this.seat];
    if (!row || (row[FLAGS_INDEX] & RACE_FLAG_DOWN) !== 0) return;
    const from = this.predictedLane ?? row[LANE_INDEX];
    this.predictedLane = Math.max(0, Math.min(3, from + (action === 'left' ? -1 : 1)));
  }

  /** True when ticks have stopped arriving — the screen says so rather than lying. */
  stalled(now = Date.now()): boolean {
    return !!this.next && now - this.nextAt > STALE_MS;
  }

  /** Read the world as it should look right now. */
  sample(now = Date.now()): RaceView {
    const view = this.view;
    const next = this.next;
    if (!next) {
      view.empty = true;
      return view;
    }
    const prev = this.prev ?? next;
    view.empty = false;
    view.done = next.done === 1;

    // Where between the two ticks "now minus the delay" falls. Clamped, so a
    // late tick holds the last frame instead of flinging bikes forward.
    const span = Math.max(1, this.nextAt - this.prevAt);
    const alpha = Math.max(0, Math.min(1, (now - DELAY_MS - this.prevAt) / span));

    let leader = -Infinity;
    for (let i = 0; i < next.b.length; i++) {
      const rider = view.riders[i] ?? (view.riders[i] = blankRider());
      const a = prev.b[i] ?? next.b[i];
      const b = next.b[i];
      const flags = b[FLAGS_INDEX];

      rider.dist = a[DIST_INDEX] + (b[DIST_INDEX] - a[DIST_INDEX]) * alpha;
      // A lane change is a step, not a slide — the renderer eases the x.
      rider.lane =
        i === this.seat && this.predictedLane !== null
          ? this.predictedLane
          : b[LANE_INDEX];
      rider.hp = b[HP_INDEX];
      rider.nitro = b[NITRO_INDEX];
      rider.speed = b[SPEED_INDEX];
      rider.boosting = (flags & RACE_FLAG_BOOST) !== 0;
      rider.down = (flags & RACE_FLAG_DOWN) !== 0;
      rider.attack =
        (flags & RACE_FLAG_KICK) !== 0
          ? 'kick'
          : (flags & RACE_FLAG_PUNCH) !== 0
            ? 'punch'
            : null;
      if (rider.dist > leader) leader = rider.dist;
    }
    view.riders.length = next.b.length;
    // The camera rides with YOU, not with whoever is winning. Following the
    // leader meant a CPU that started ahead dragged the view off your own
    // bike — which looked exactly like the controls had stopped working.
    // A spectator has no bike, so they get the leader's view.
    const mine = this.seat >= 0 ? view.riders[this.seat] : undefined;
    view.cameraDist = mine ? mine.dist : leader === -Infinity ? 0 : leader;

    lerpObjects(view.cars, prev.c, next.c, alpha);
    lerpObjects(view.pads, prev.p, next.p, alpha);
    return view;
  }
}

function lerpObjects(
  out: RaceObject[],
  prev: number[][],
  next: number[][],
  alpha: number,
): void {
  for (let i = 0; i < next.length; i++) {
    const slot = out[i] ?? (out[i] = { lane: 0, dist: 0 });
    const a = prev[i] ?? next[i];
    const b = next[i];
    slot.lane = b[LANE_INDEX];
    // A recycled object jumps a long way up the road; snap rather than slide.
    const gap = b[DIST_INDEX] - a[DIST_INDEX];
    slot.dist = Math.abs(gap) > 200 ? b[DIST_INDEX] : a[DIST_INDEX] + gap * alpha;
  }
  out.length = next.length;
}
