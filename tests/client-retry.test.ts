import { describe, expect, it } from "vitest";
import {
  MAX_TRIES,
  captureOutcome,
  checkRefund,
  focusAfterRemoval,
  nextTry,
  readJson,
  retryAfterMs,
  sendWithRetry,
} from "@/lib/client-retry";

describe("nextTry", () => {
  it("backs off 1 s, 2 s, 4 s, 8 s after each failed try", () => {
    const waits = [1, 2, 3, 4].map((tries) => nextTry({ tries, elapsedMs: 0, status: 500 }));
    expect(waits).toEqual([
      { retry: true, waitMs: 1000 },
      { retry: true, waitMs: 2000 },
      { retry: true, waitMs: 4000 },
      { retry: true, waitMs: 8000 },
    ]);
  });

  it("gives up after five tries", () => {
    expect(MAX_TRIES).toBe(5);
    expect(nextTry({ tries: 5, elapsedMs: 0, status: 500 })).toEqual({ retry: false, reason: "gave_up" });
  });

  it("gives up when the next wait would pass 30 seconds", () => {
    expect(nextTry({ tries: 2, elapsedMs: 29_000, status: null })).toEqual({ retry: false, reason: "gave_up" });
    expect(nextTry({ tries: 2, elapsedMs: 27_000, status: null })).toEqual({ retry: true, waitMs: 2000 });
  });

  it("retries a failed fetch (no status)", () => {
    expect(nextTry({ tries: 1, elapsedMs: 0, status: null })).toEqual({ retry: true, waitMs: 1000 });
  });

  it("never retries a wrong stand code", () => {
    expect(nextTry({ tries: 1, elapsedMs: 0, status: 401 })).toEqual({ retry: false, reason: "wrong_code" });
  });

  it("does not retry a request the server will never accept", () => {
    expect(nextTry({ tries: 1, elapsedMs: 0, status: 400 })).toEqual({ retry: false, reason: "gave_up" });
    expect(nextTry({ tries: 1, elapsedMs: 0, status: 413 })).toEqual({ retry: false, reason: "gave_up" });
  });

  it("waits as long as a 429 asks, within bounds", () => {
    expect(nextTry({ tries: 1, elapsedMs: 0, status: 429, retryAfterMs: 6000 })).toEqual({ retry: true, waitMs: 6000 });
    expect(nextTry({ tries: 1, elapsedMs: 0, status: 429, retryAfterMs: 600_000 })).toEqual({ retry: true, waitMs: 15_000 });
    // No header: a short wait, never shorter than the ordinary back-off.
    expect(nextTry({ tries: 1, elapsedMs: 0, status: 429 })).toEqual({ retry: true, waitMs: 5000 });
    expect(nextTry({ tries: 4, elapsedMs: 0, status: 429 })).toEqual({ retry: true, waitMs: 8000 });
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and ignores anything else", () => {
    expect(retryAfterMs("7")).toBe(7000);
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs("soon")).toBeUndefined();
    expect(retryAfterMs("-1")).toBeUndefined();
  });
});

describe("sendWithRetry", () => {
  const res = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });
  const clock = () => {
    let t = 0;
    const waits: number[] = [];
    return {
      waits,
      now: () => t,
      sleep: async (ms: number) => {
        waits.push(ms);
        t += ms;
      },
    };
  };

  it("returns the first answer that is ok", async () => {
    const c = clock();
    const answers = [res(500), null, res(200)];
    const waiting: number[] = [];
    const out = await sendWithRetry(async () => answers.shift() ?? null, { ...c, onWaiting: (tries) => waiting.push(tries) });
    expect(out.ok && out.response.status).toBe(200);
    expect(c.waits).toEqual([1000, 2000]);
    expect(waiting).toEqual([1, 2]);
  });

  it("treats a thrown fetch as a failed try", async () => {
    const c = clock();
    let calls = 0;
    const out = await sendWithRetry(async () => {
      if (++calls === 1) throw new TypeError("Failed to fetch");
      return res(200);
    }, c);
    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("stops at once on a wrong code", async () => {
    const c = clock();
    let calls = 0;
    const out = await sendWithRetry(async () => (calls++, res(401)), c);
    expect(out).toEqual({ ok: false, reason: "wrong_code" });
    expect(calls).toBe(1);
    expect(c.waits).toEqual([]);
  });

  it("gives up after five tries", async () => {
    const c = clock();
    let calls = 0;
    const out = await sendWithRetry(async () => (calls++, res(503)), c);
    expect(out).toEqual({ ok: false, reason: "gave_up" });
    expect(calls).toBe(5);
    expect(c.waits).toEqual([1000, 2000, 4000, 8000]);
  });

  it("respects the wait a 429 asks for", async () => {
    const c = clock();
    const answers = [res(429, { "retry-after": "3" }), res(200)];
    const out = await sendWithRetry(async () => answers.shift()!, c);
    expect(out.ok).toBe(true);
    expect(c.waits).toEqual([3000]);
  });
});

describe("readJson", () => {
  it("returns the parsed body, or null when it is not JSON", async () => {
    expect(await readJson(Response.json({ a: 1 }))).toEqual({ a: 1 });
    expect(await readJson(new Response("<html>502</html>", { status: 502 }))).toBeNull();
    expect(await readJson(new Response(null, { status: 204 }))).toBeNull();
  });
});

describe("captureOutcome", () => {
  it("is paid when the server says so", () => {
    expect(captureOutcome(200, undefined)).toBe("paid");
  });
  it("is unconfirmed when money may have moved", () => {
    expect(captureOutcome(500, "server_error")).toBe("unconfirmed");
    expect(captureOutcome(502, undefined)).toBe("unconfirmed");
    expect(captureOutcome(409, "captured_but_unrecorded")).toBe("unconfirmed");
    // The request never got an answer: the server may still have captured.
    expect(captureOutcome(null, undefined)).toBe("unconfirmed");
  });
  it("is refused when the server turned it down before capturing", () => {
    expect(captureOutcome(409, "amount_mismatch")).toBe("refused");
    expect(captureOutcome(409, "too_late")).toBe("refused");
    expect(captureOutcome(400, "bad_request")).toBe("refused");
  });
});

describe("checkRefund", () => {
  it("accepts an amount up to what is left", () => {
    expect(checkRefund("4.50", 1900)).toEqual({ ok: true, cents: 450 });
    expect(checkRefund("19", 1900)).toEqual({ ok: true, cents: 1900 });
    expect(checkRefund(" 0.01 ", 1900)).toEqual({ ok: true, cents: 1 });
  });
  it("refuses what is not an amount", () => {
    for (const text of ["", "abc", "0", "-5", "0.004"]) {
      expect(checkRefund(text, 1900)).toEqual({ ok: false, reason: "invalid" });
    }
  });
  it("refuses more than what is left", () => {
    expect(checkRefund("25", 1900)).toEqual({ ok: false, reason: "too_much" });
    expect(checkRefund("19.01", 1900)).toEqual({ ok: false, reason: "too_much" });
  });
});

describe("focusAfterRemoval", () => {
  it("moves to the one that takes its place", () => {
    expect(focusAfterRemoval(["a", "b", "c"], "b")).toBe("c");
    expect(focusAfterRemoval(["a", "b", "c"], "a")).toBe("b");
  });
  it("moves to the one before when the last is removed", () => {
    expect(focusAfterRemoval(["a", "b", "c"], "c")).toBe("b");
  });
  it("has nowhere in the list to go when it empties", () => {
    expect(focusAfterRemoval(["a"], "a")).toBeNull();
    expect(focusAfterRemoval([], "a")).toBeNull();
  });
  it("stays put when the id was not in the list", () => {
    expect(focusAfterRemoval(["a", "b"], "z")).toBeNull();
  });
});
