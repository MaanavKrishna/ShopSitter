import { describe, expect, it } from "vitest";
import { frameDistance, initialDetector, stepDetector, type DetectorState } from "@/lib/frame-diff";

const frame = (fill: number, changed = 0) => {
  const f = new Uint8ClampedArray(64 * 48).fill(fill);
  for (let i = 0; i < changed; i++) f[i] = fill + 100;
  return f;
};

/** Feeds samples every 250 ms; returns the times and payloads of each fire. */
function run(samples: { until: number; vsPrev: number; vsBaseline: number }[]) {
  let state: DetectorState = initialDetector();
  const fires: { at: number; changeStartedAt: number; settledAt: number }[] = [];
  let t = 0;
  for (const s of samples) {
    for (; t <= s.until; t += 250) {
      const r = stepDetector(state, { vsPrev: s.vsPrev, vsBaseline: s.vsBaseline, t });
      state = r.state;
      if (r.fire) fires.push({ at: t, ...r.fire });
    }
  }
  return fires;
}

const QUIET = { vsPrev: 0, vsBaseline: 0 };
const MOVING = { vsPrev: 0.2, vsBaseline: 0.2 };
const CHANGED = { vsPrev: 0, vsBaseline: 0.1 };

describe("frameDistance", () => {
  it("is zero for identical frames", () => {
    expect(frameDistance(frame(100), frame(100))).toBe(0);
  });
  it("is the fraction of pixels that changed noticeably", () => {
    expect(frameDistance(frame(100), frame(100, 768))).toBeCloseTo(0.25);
  });
  it("ignores small brightness wobble", () => {
    expect(frameDistance(frame(100), frame(110))).toBe(0);
  });
});

describe("stepDetector", () => {
  it("fires once, two seconds after the shelf settles in a changed state", () => {
    const fires = run([
      { until: 750, ...QUIET },
      { until: 3000, ...MOVING },
      { until: 8000, ...CHANGED },
    ]);
    expect(fires).toHaveLength(1);
    expect(fires[0].changeStartedAt).toBe(1000);
    expect(fires[0].settledAt).toBe(5250);
  });

  it("does not fire when a hand comes and goes and the shelf looks the same", () => {
    expect(run([{ until: 750, ...QUIET }, { until: 3000, ...MOVING }, { until: 8000, ...QUIET }])).toEqual([]);
  });

  it("does not fire while movement keeps restarting", () => {
    const fires = run([
      { until: 2000, ...MOVING },
      { until: 3000, ...CHANGED },
      { until: 5000, ...MOVING },
      { until: 6000, ...CHANGED },
    ]);
    expect(fires).toEqual([]);
  });

  it("fires separately for two separate changes", () => {
    const fires = run([
      { until: 1000, ...MOVING },
      { until: 4000, ...CHANGED },
      { until: 4750, ...QUIET },
      { until: 6000, ...MOVING },
      { until: 9000, ...CHANGED },
    ]);
    expect(fires).toHaveLength(2);
    expect(fires[1].changeStartedAt).toBe(5000);
  });
});
