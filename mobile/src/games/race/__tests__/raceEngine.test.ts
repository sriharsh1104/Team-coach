import {
  FINISH_DIST,
  RaceState,
  cameraLeader,
  createRaceState,
  humansIn,
  kmh,
  laneCenterX,
  raceAttack,
  raceNitro,
  raceStep,
  raceSteer,
  standings,
  takeEvents,
} from '../raceEngine';

/** Deterministic rng so a race plays out the same way every run. */
function seeded(seed = 11): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function race(mode: Parameters<typeof createRaceState>[0] = '1p'): RaceState {
  return createRaceState(mode, 390, 760, seeded());
}

/** Keep the world still so a test can assert on one rule at a time. */
function quiet(state: RaceState): RaceState {
  state.traffic = [];
  state.pads = [];
  return state;
}

describe('raceEngine', () => {
  it('puts four bikes on the grid, humans first', () => {
    const solo = race('1p');
    expect(solo.bikers).toHaveLength(4);
    expect(solo.bikers.filter((b) => b.isHuman)).toHaveLength(1);
    expect(solo.bikers[0].name).toBe('P1 VIPER');
    expect(solo.bikers[1].name).toBe('RAZOR (CPU)');

    const four = race('4p');
    expect(four.bikers.every((b) => b.isHuman)).toBe(true);
    expect(four.bikers[3].name).toBe('P4 BRAWLER');
    expect(humansIn('3p')).toBe(3);
  });

  it('steers one lane at a time and stops at the edges', () => {
    const state = quiet(race());
    const me = state.bikers[0];
    expect(me.lane).toBe(0);

    raceSteer(state, 0, -1);
    expect(me.lane).toBe(0); // already against the left kerb

    raceSteer(state, 0, 1);
    raceSteer(state, 0, 1);
    raceSteer(state, 0, 1);
    raceSteer(state, 0, 1);
    expect(me.lane).toBe(3); // and against the right one
  });

  it('spends nitro, refuses it when the tank is low, and will not stack', () => {
    const state = quiet(race());
    const me = state.bikers[0];

    expect(raceNitro(state, 0)).toBe(true);
    expect(me.nitro).toBe(70);
    expect(me.boostTimer).toBeGreaterThan(0);

    // Already boosting.
    expect(raceNitro(state, 0)).toBe(false);

    me.boostTimer = 0;
    me.nitro = 20;
    expect(raceNitro(state, 0)).toBe(false);
  });

  it('kicks a rival straight off the bike, and punches chip at them instead', () => {
    const kicked = quiet(race());
    kicked.bikers[1].lane = 1;
    kicked.bikers[1].dist = kicked.bikers[0].dist + 10;
    raceAttack(kicked, 0, 'kick');
    expect(kicked.bikers[1].wipeoutTimer).toBeGreaterThan(0);

    const punched = quiet(race());
    punched.bikers[1].lane = 1;
    punched.bikers[1].dist = punched.bikers[0].dist + 10;
    raceAttack(punched, 0, 'punch');
    expect(punched.bikers[1].hp).toBe(65);
    expect(punched.bikers[1].wipeoutTimer).toBe(0);
    // Shoved a lane over by the blow.
    expect(punched.bikers[1].lane).toBe(2);
  });

  it('misses when nobody is alongside', () => {
    const state = quiet(race());
    for (const b of state.bikers.slice(1)) b.dist = 5000;
    raceAttack(state, 0, 'kick');
    expect(state.bikers.every((b, i) => i === 0 || b.wipeoutTimer === 0)).toBe(true);
    expect(state.bikers[0].attackTimer).toBeGreaterThan(0);
  });

  it('will not let a downed rider steer, swing or boost', () => {
    const state = quiet(race());
    const me = state.bikers[0];
    me.wipeoutTimer = 40;

    raceSteer(state, 0, 1);
    expect(me.lane).toBe(0);
    expect(raceNitro(state, 0)).toBe(false);
    raceAttack(state, 0, 'kick');
    expect(me.attackTimer).toBe(0);
  });

  it('wipes a rider out when they hit traffic', () => {
    const state = race();
    state.pads = [];
    const me = state.bikers[0];
    // Park a car exactly where the rider is.
    const y = state.ch - 115;
    me.x = laneCenterX(state, me.lane, y);
    state.traffic = [{ lane: me.lane, y, speed: 3, color: '#fff' }];

    raceStep(state, 1, seeded());
    expect(me.wipeoutTimer).toBeGreaterThan(0);
    expect(takeEvents(state).some((e) => e.type === 'crash')).toBe(true);
  });

  it('runs the race to a finish and names the winner once', () => {
    const state = quiet(race());
    state.bikers[0].dist = FINISH_DIST - 1;

    raceStep(state, 1, seeded());
    expect(state.finished).toBe(true);
    expect(state.winnerId).toBe(0);

    const before = state.winnerId;
    raceStep(state, 1, seeded());
    expect(state.winnerId).toBe(before);
  });

  it('freezes the race once it is over', () => {
    const state = quiet(race());
    state.finished = true;
    const at = state.bikers[0].dist;
    raceStep(state, 10, seeded());
    expect(state.bikers[0].dist).toBe(at);
  });

  it('orders the standings by distance, and by who finished first', () => {
    const state = quiet(race());
    state.bikers[2].dist = 900;
    state.bikers[1].dist = 500;
    expect(standings(state).map((b) => b.id)).toEqual([2, 1, 3, 0]);

    state.bikers[0].finishedAt = 10;
    expect(standings(state)[0].id).toBe(0);
  });

  it('keeps the camera on whichever human is in front', () => {
    const state = quiet(race('2p'));
    state.bikers[1].dist = 2000;
    expect(cameraLeader(state).id).toBe(1);
  });

  it('bends the road away from the bottom of the screen, never at it', () => {
    const state = quiet(race());
    state.roadCurve = 1;
    const nearY = state.ch;
    const farY = 0;
    const atBottom = laneCenterX(state, 1, nearY);
    const atHorizon = laneCenterX(state, 1, farY);
    // The bend grows with distance, so the far end is pushed further across.
    expect(Math.abs(atHorizon - atBottom)).toBeGreaterThan(50);
  });

  it('converts speed to the readout the HUD shows', () => {
    const state = race();
    state.bikers[0].speed = 8;
    expect(kmh(state.bikers[0])).toBe(200);
  });
});
