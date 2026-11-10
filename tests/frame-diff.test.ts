import { describe, expect, it } from "vitest";
import {
  GRID_COLS,
  GRID_ROWS,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  compareGrids,
  cropBox,
  initialDetector,
  stepDetector,
  toGrid,
  type DetectorState,
} from "@/lib/frame-diff";

/** A flat grey frame, optionally with a darker rectangle (an "item") drawn on it. */
function frame(level: number, item?: { x: number; y: number; w: number; h: number; level?: number }) {
  const f = new Uint8ClampedArray(SAMPLE_WIDTH * SAMPLE_HEIGHT).fill(level);
  if (item) {
    for (let y = item.y; y < item.y + item.h; y++) {
      for (let x = item.x; x < item.x + item.w; x++) f[y * SAMPLE_WIDTH + x] = item.level ?? 30;
    }
  }
  return f;
}

describe("compareGrids", () => {
  const empty = toGrid(frame(150));

  it("finds no change between identical frames", () => {
    expect(compareGrids(empty, toGrid(frame(150))).changed).toBe(0);
  });

  it("ignores the whole picture getting brighter or darker", () => {
    // What a phone camera does when its exposure adjusts.
    expect(compareGrids(empty, toGrid(frame(175))).changed).toBe(0);
    const withItem = toGrid(frame(150, { x: 40, y: 30, w: 16, h: 12 }));
    const brighterWithItem = toGrid(frame(170, { x: 40, y: 30, w: 16, h: 12, level: 50 }));
    expect(compareGrids(withItem, brighterWithItem).changed).toBe(0);
  });

  it("notices a small item appearing, and says where", () => {
    // 8 x 8 pixels in a 96 x 72 frame: under 1% of the picture.
    const small = toGrid(frame(150, { x: 48, y: 32, w: 8, h: 8 }));
    const result = compareGrids(empty, small);
    expect(result.changed).toBeGreaterThanOrEqual(2);
    expect(result.box).toEqual({ col0: 12, row0: 8, col1: 13, row1: 9 });
  });

  it("ignores single-pixel sensor noise", () => {
    const noisy = frame(150);
    for (let i = 0; i < noisy.length; i += 7) noisy[i] += i % 2 ? 6 : -6;
    expect(compareGrids(empty, toGrid(noisy)).changed).toBe(0);
  });

  it("uses a grid fine enough for small items", () => {
    expect(GRID_COLS * GRID_ROWS).toBeGreaterThanOrEqual(400);
  });
});

describe("cropBox", () => {
  it("turns a changed grid area into a padded pixel rectangle inside the photo", () => {
    const box = cropBox({ col0: 12, row0: 8, col1: 13, row1: 9 }, 1920, 1440);
    // The item is around (1000, 680); the crop surrounds it with room to spare and stays in bounds.
    expect(box.x).toBeLessThan(960);
    expect(box.x + box.w).toBeGreaterThan(1120);
    expect(box.y).toBeLessThan(640);
    expect(box.y + box.h).toBeGreaterThan(800);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(1920);
    expect(box.y + box.h).toBeLessThanOrEqual(1440);
  });

  it("is never smaller than a third of the photo, so there is context around the item", () => {
    const box = cropBox({ col0: 0, row0: 0, col1: 0, row1: 0 }, 1920, 1440);
    expect(box.w).toBeGreaterThanOrEqual(640);
    expect(box.h).toBeGreaterThanOrEqual(480);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
  });
});

/** Feeds samples every 200 ms; returns each fire with the time it happened. */
function run(samples: { until: number; moving: boolean; differs: boolean }[]) {
  let state: DetectorState = initialDetector();
  const fires: { at: number; changeStartedAt: number; settledAt: number }[] = [];
  let t = 0;
  for (const s of samples) {
    for (; t <= s.until; t += 200) {
      const r = stepDetector(state, { moving: s.moving, differs: s.differs, t });
      state = r.state;
      if (r.fire) fires.push({ at: t, ...r.fire });
    }
  }
  return fires;
}

const QUIET = { moving: false, differs: false };
const MOVING = { moving: true, differs: true };
const CHANGED = { moving: false, differs: true };

describe("stepDetector", () => {
  it("fires once, about a second after the shelf settles in a changed state", () => {
    const fires = run([{ until: 800, ...QUIET }, { until: 3000, ...MOVING }, { until: 8000, ...CHANGED }]);
    expect(fires).toHaveLength(1);
    expect(fires[0].changeStartedAt).toBe(1000);
    expect(fires[0].settledAt - 3200).toBeLessThanOrEqual(1200);
  });

  it("does not fire when a hand comes and goes and the shelf looks the same", () => {
    expect(run([{ until: 800, ...QUIET }, { until: 3000, ...MOVING }, { until: 8000, ...QUIET }])).toEqual([]);
  });

  it("does not fire while movement keeps restarting", () => {
    const fires = run([
      { until: 2000, ...MOVING },
      { until: 2600, ...CHANGED },
      { until: 5000, ...MOVING },
      { until: 5600, ...CHANGED },
    ]);
    expect(fires).toEqual([]);
  });

  it("fires separately for two separate changes", () => {
    const fires = run([
      { until: 1000, ...MOVING },
      { until: 4000, ...CHANGED },
      { until: 4800, ...QUIET },
      { until: 6000, ...MOVING },
      { until: 9000, ...CHANGED },
    ]);
    expect(fires).toHaveLength(2);
    expect(fires[1].changeStartedAt).toBe(5000);
  });

  it("still fires when the shelf differs for a while with no movement ever seen", () => {
    // A grab too quick for the camera.
    const fires = run([{ until: 400, ...QUIET }, { until: 4000, ...CHANGED }]);
    expect(fires.length).toBeGreaterThanOrEqual(1);
    expect(fires[0].changeStartedAt).toBe(600);
    expect(fires[0].settledAt - 600).toBeLessThanOrEqual(2600);
  });

  it("does not fire for a difference that goes away quickly", () => {
    expect(run([{ until: 400, ...QUIET }, { until: 1800, ...CHANGED }, { until: 8000, ...QUIET }])).toEqual([]);
  });

  it("reads anyway when the picture never goes still for 8 seconds", () => {
    // A flickering light or a noisy camera must not block reads for ever.
    const fires = run([{ until: 400, ...QUIET }, { until: 9000, ...MOVING }]);
    expect(fires).toHaveLength(1);
    expect(fires[0].changeStartedAt).toBe(600);
    expect(fires[0].at).toBe(8600);
  });
});
