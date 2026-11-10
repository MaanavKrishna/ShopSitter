import { describe, expect, it } from "vitest";
import { initialPresence, stepPresence, type PresenceState } from "@/lib/presence";

/** Feeds one sighting result every 500 ms. Returns when someone was present and when they were counted as gone. */
function run(seen: boolean[]) {
  let state: PresenceState = initialPresence();
  const present: boolean[] = [];
  const left: number[] = [];
  seen.forEach((s, i) => {
    const r = stepPresence(state, { seen: s, t: i * 500 });
    state = r.state;
    present.push(state.present);
    if (r.left) left.push(i * 500);
  });
  return { present, left };
}

describe("stepPresence", () => {
  it("needs two sightings in a row, so one false alarm is ignored", () => {
    expect(run([false, true, false, false]).present).toEqual([false, false, false, false]);
    expect(run([true, true]).present).toEqual([false, true]);
  });

  it("stays on through short gaps and turns off 3 seconds after the last sighting", () => {
    const r = run([true, true, false, true, false, false, false, false, false, false, false]);
    expect(r.present.slice(1, 9)).toEqual([true, true, true, true, true, true, true, true]);
    expect(r.present[9]).toBe(false);
    expect(r.left).toEqual([4500]);
  });

  it("counts each visitor once", () => {
    const gap = Array(8).fill(false);
    expect(run([true, true, ...gap, true, true, true, ...gap]).left).toHaveLength(2);
  });
});
