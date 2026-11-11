import { describe, expect, it } from "vitest";
import { getGoing, standChangeProblem, timeLeft, trialOver, trialStartProblem } from "@/lib/trial-view";

const HOUR = 60 * 60_000;
const MIN = 60_000;

describe("timeLeft", () => {
  it("writes hours and minutes", () => {
    expect(timeLeft(23 * HOUR + 12 * MIN, 0)).toBe("23 h 12 min");
  });

  it("rounds down to the whole minute", () => {
    expect(timeLeft(1000 + 2 * HOUR + 5 * MIN + 59_000, 1000)).toBe("2 h 5 min");
  });

  it("keeps the minutes when they are zero, so the width does not jump", () => {
    expect(timeLeft(24 * HOUR, 0)).toBe("24 h 0 min");
  });

  it("drops the hours in the last hour", () => {
    expect(timeLeft(59 * MIN + 30_000, 0)).toBe("59 min");
    expect(timeLeft(MIN, 0)).toBe("1 min");
  });

  it("says under a minute at the very end", () => {
    expect(timeLeft(59_999, 0)).toBe("under a minute");
    expect(timeLeft(1, 0)).toBe("under a minute");
  });

  it("is empty once the time has passed", () => {
    expect(timeLeft(5000, 5000)).toBe("");
    expect(timeLeft(5000, 9000)).toBe("");
  });
});

describe("trialOver", () => {
  it("turns true at the moment of expiry", () => {
    expect(trialOver(5000, 4999)).toBe(false);
    expect(trialOver(5000, 5000)).toBe(true);
    expect(trialOver(5000, 5001)).toBe(true);
  });
});

describe("getGoing", () => {
  const fresh = { products: 0, visits: [], visitors: 0, standOpened: false };
  const done = (state: ReturnType<typeof getGoing>) => state.steps.map((s) => s.done);

  it("starts with nothing done and products next", () => {
    const state = getGoing(fresh);
    expect(state.steps.map((s) => s.key)).toEqual(["products", "stand", "take", "paid"]);
    expect(done(state)).toEqual([false, false, false, false]);
    expect(state.next).toBe("products");
    expect(state.complete).toBe(false);
  });

  it("ticks products once there is one, and points at the stand", () => {
    const state = getGoing({ ...fresh, products: 2 });
    expect(done(state)).toEqual([true, false, false, false]);
    expect(state.next).toBe("stand");
  });

  it("ticks the stand when this browser opened it", () => {
    const state = getGoing({ ...fresh, products: 1, standOpened: true });
    expect(done(state)).toEqual([true, true, false, false]);
    expect(state.next).toBe("take");
  });

  it("ticks the stand when it has counted someone stopping by", () => {
    expect(done(getGoing({ ...fresh, products: 1, visitors: 1 }))).toEqual([true, true, false, false]);
  });

  it("ticks the stand, but not a visit, for a shelf read where nothing was taken", () => {
    const state = getGoing({ ...fresh, products: 1, visits: [{ status: "empty" }] });
    expect(done(state)).toEqual([true, true, false, false]);
  });

  it("ticks the first visit when something left the shelf", () => {
    const state = getGoing({ ...fresh, products: 1, visits: [{ status: "open" }] });
    expect(done(state)).toEqual([true, true, true, false]);
    expect(state.next).toBe("paid");
  });

  it("counts an unmatched visit as a visit but not as paid", () => {
    expect(done(getGoing({ ...fresh, products: 1, visits: [{ status: "unmatched" }] }))).toEqual([true, true, true, false]);
  });

  it("is complete once a visit is paid, however it was paid", () => {
    for (const status of ["paid", "paid_adjusted", "paid_late"]) {
      const state = getGoing({ ...fresh, products: 3, visits: [{ status: "open" }, { status }] });
      expect(done(state)).toEqual([true, true, true, true]);
      expect(state.next).toBeNull();
      expect(state.complete).toBe(true);
    }
  });

  it("keeps pointing at products when they were all removed after a visit", () => {
    const state = getGoing({ ...fresh, visits: [{ status: "paid" }] });
    expect(done(state)).toEqual([false, true, true, true]);
    expect(state.next).toBe("products");
    expect(state.complete).toBe(false);
  });
});

describe("trialStartProblem", () => {
  it("tells a signed-in owner how to get past it", () => {
    expect(trialStartProblem(409, "owner_signed_in")).toBe(
      "You're signed in to a real stand on this browser. Sign out first, or use a private window.",
    );
  });

  it("tells apart the caller's own limit and the shared one", () => {
    expect(trialStartProblem(429, "slow_down")).toMatch(/started a few/);
    expect(trialStartProblem(429, "trial_busy")).toMatch(/busy/);
    expect(trialStartProblem(429, "slow_down")).not.toBe(trialStartProblem(429, "trial_busy"));
  });

  it("names the connection when there was no answer", () => {
    expect(trialStartProblem(null, undefined)).toMatch(/connection/);
  });

  it("has plain words for anything else", () => {
    expect(trialStartProblem(500, "server_error")).toMatch(/couldn't be started/);
    expect(trialStartProblem(418, undefined)).toMatch(/couldn't be started/);
  });
});

describe("standChangeProblem", () => {
  it("has words for each trial-only refusal", () => {
    expect(standChangeProblem("trial_read_limit")).toBe("This trial has used today's 60 shelf reads.");
    expect(standChangeProblem("trial_busy")).toMatch(/busy/);
    expect(standChangeProblem("photo_too_large")).toMatch(/too large/);
  });

  it("has nothing to add for other errors", () => {
    expect(standChangeProblem("bad_request")).toBeNull();
    expect(standChangeProblem(undefined)).toBeNull();
  });
});
