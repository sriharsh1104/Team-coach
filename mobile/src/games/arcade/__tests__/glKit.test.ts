import { pixelTextMesh, roundedMesh } from '../glKit';

describe('glKit', () => {
  it('bakes a word into one mesh of lit pixels', () => {
    const mesh = pixelTextMesh('P1', 2, '#ffffff');
    const count = mesh.geometry.getAttribute('position').count;
    // Four corners per lit pixel, and both glyphs have pixels lit.
    expect(count % 4).toBe(0);
    expect(count).toBeGreaterThan(40);
  });

  it('centres the label on its own origin', () => {
    const mesh = pixelTextMesh('VIPER', 1.5, '#ffffff');
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(2);
    expect(Math.abs(box.min.y + box.max.y)).toBeLessThan(0.001);
  });

  it('skips characters the font does not have rather than throwing', () => {
    const mesh = pixelTextMesh('A?B', 2, '#ffffff');
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('rounds a rectangle without exceeding its own half-size', () => {
    // A radius bigger than the box would invert the corners; it is clamped.
    const mesh = roundedMesh(10, 10, 40, '#ffffff');
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(box.max.x).toBeCloseTo(5, 3);
    expect(box.max.y).toBeCloseTo(5, 3);
  });
});
