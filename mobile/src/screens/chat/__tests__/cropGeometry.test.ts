import {
  ASPECT_PRESETS,
  clampCrop,
  fitContain,
  initialCrop,
  isFullFrame,
  MIN_CROP_PX,
  toSourceRect,
  type Rect,
} from '../cropGeometry';

const BOX = { width: 300, height: 400 };

describe('fitContain', () => {
  it('letterboxes a wide image into a tall box', () => {
    const r = fitContain(1000, 500, BOX.width, BOX.height);
    expect(r.width).toBe(300);
    expect(r.height).toBe(150);
    expect(r.x).toBe(0);
    expect(r.y).toBe(125);
  });

  it('pillarboxes a tall image into a wide box', () => {
    const r = fitContain(500, 1000, 400, 300);
    expect(r.height).toBe(300);
    expect(r.width).toBe(150);
    expect(r.x).toBe(125);
    expect(r.y).toBe(0);
  });

  it('returns an empty rect for a not-yet-measured image or box', () => {
    expect(fitContain(0, 0, 300, 400)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(fitContain(100, 100, 0, 0).width).toBe(0);
  });
});

describe('initialCrop', () => {
  const bounds: Rect = { x: 0, y: 100, width: 300, height: 200 };

  it('free crop covers the whole image', () => {
    expect(initialCrop(bounds, null)).toEqual(bounds);
  });

  it('a locked aspect fits inside and stays centred', () => {
    const square = initialCrop(bounds, 1);
    expect(square.width).toBe(200);
    expect(square.height).toBe(200);
    expect(square.x).toBe(50);
    expect(square.y).toBe(100);
  });

  it('picks the limiting axis for a wide aspect', () => {
    const wide = initialCrop(bounds, 16 / 9);
    expect(wide.width).toBe(300);
    expect(wide.height).toBeCloseTo(168.75);
  });
});

describe('clampCrop', () => {
  const bounds: Rect = { x: 0, y: 0, width: 300, height: 400 };

  it('dragging keeps the rect inside the image', () => {
    const dragged = { x: -50, y: 380, width: 100, height: 100 };
    const r = clampCrop(dragged, bounds, null, 'move');
    expect(r.x).toBe(0);
    expect(r.y).toBe(300);
    expect(r.width).toBe(100);
  });

  it('never shrinks below the minimum grab size', () => {
    const tiny = { x: 10, y: 10, width: 2, height: 2 };
    const r = clampCrop(tiny, bounds, null, 'br');
    expect(r.width).toBeGreaterThanOrEqual(MIN_CROP_PX);
    expect(r.height).toBeGreaterThanOrEqual(MIN_CROP_PX);
  });

  it('resizing from a corner pins the opposite corner', () => {
    // Holding the bottom-right: the top-left must not move.
    const r = clampCrop(
      { x: 40, y: 60, width: 500, height: 500 },
      bounds,
      null,
      'br',
    );
    expect(r.x).toBe(40);
    expect(r.y).toBe(60);
    expect(r.width).toBe(260);
    expect(r.height).toBe(340);
  });

  it('resizing from the top-left pins the bottom-right', () => {
    const r = clampCrop(
      { x: 100, y: 100, width: 80, height: 80 },
      bounds,
      null,
      'tl',
    );
    // Fixed corner is (180, 180); the handle moves, that corner does not.
    expect(r.x + r.width).toBeCloseTo(180);
    expect(r.y + r.height).toBeCloseTo(180);
  });

  it('a locked aspect survives a resize', () => {
    const r = clampCrop(
      { x: 0, y: 0, width: 200, height: 999 },
      bounds,
      1,
      'br',
    );
    expect(r.width).toBeCloseTo(r.height);
  });

  it('a locked aspect still fits when the drag runs off the edge', () => {
    const r = clampCrop(
      { x: 0, y: 0, width: 999, height: 999 },
      bounds,
      16 / 9,
      'br',
    );
    expect(r.width).toBeLessThanOrEqual(bounds.width + 0.01);
    expect(r.height).toBeLessThanOrEqual(bounds.height + 0.01);
    expect(r.width / r.height).toBeCloseTo(16 / 9);
  });
});

describe('toSourceRect', () => {
  // A 4000x3000 photo shown 300 wide, letterboxed in a 300x400 box.
  const display = fitContain(4000, 3000, 300, 400);

  it('maps a full-frame crop onto the whole image', () => {
    const r = toSourceRect(display, display, 4000, 3000);
    expect(r).toEqual({
      originX: 0,
      originY: 0,
      width: 4000,
      height: 3000,
    });
  });

  it('scales a half-width crop back to source pixels', () => {
    const half = {
      x: display.x,
      y: display.y,
      width: display.width / 2,
      height: display.height,
    };
    const r = toSourceRect(half, display, 4000, 3000);
    expect(r.originX).toBe(0);
    expect(r.width).toBe(2000);
    expect(r.height).toBe(3000);
  });

  it('never asks for a pixel past the edge of the file', () => {
    // A rect nudged slightly outside by rounding.
    const overhang = {
      x: display.x + display.width - 1,
      y: display.y + display.height - 1,
      width: 50,
      height: 50,
    };
    const r = toSourceRect(overhang, display, 4000, 3000);
    expect(r.originX + r.width).toBeLessThanOrEqual(4000);
    expect(r.originY + r.height).toBeLessThanOrEqual(3000);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it('falls back to the whole image when nothing is measured yet', () => {
    const r = toSourceRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 0 },
      800,
      600,
    );
    expect(r).toEqual({ originX: 0, originY: 0, width: 800, height: 600 });
  });
});

describe('isFullFrame', () => {
  const display: Rect = { x: 10, y: 20, width: 300, height: 200 };

  it('is true for an untouched crop, so Send can skip the work', () => {
    expect(isFullFrame({ ...display }, display)).toBe(true);
    // Sub-pixel drift from layout rounding still counts as untouched.
    expect(isFullFrame({ ...display, width: 300.4 }, display)).toBe(true);
  });

  it('is false once the user actually cropped', () => {
    expect(isFullFrame({ ...display, width: 200 }, display)).toBe(false);
  });
});

describe('aspect presets', () => {
  it('offers Free first so the default is no constraint', () => {
    expect(ASPECT_PRESETS[0].value).toBeNull();
    expect(ASPECT_PRESETS.map((p) => p.label)).toEqual([
      'Free',
      '1:1',
      '4:5',
      '16:9',
    ]);
  });
});
