import { describe, expect, it } from "vitest";
import {
  MAX_READS,
  SCRIPT,
  SHELVES,
  SIM_PRODUCTS,
  announce,
  basketChanges,
  explainRead,
  nextStep,
  pictureAfter,
  readProblem,
  sameScene,
  scriptChains,
  setupProblem,
  stepRail,
} from "@/lib/simulator";

describe("the script", () => {
  it("chains: every step starts from the picture its shelf is showing", () => {
    expect(scriptChains(SCRIPT)).toBe(true);
  });

  it("notices a step whose before picture does not match the shelf", () => {
    const broken = [SCRIPT[0], { ...SCRIPT[2], before: "two-kinds-before.jpg" }];
    expect(scriptChains(broken)).toBe(false);
  });

  it("only changes products kept on the shelf the step happens on", () => {
    for (const step of SCRIPT) {
      for (const line of step.expect) {
        const product = SIM_PRODUCTS.find((p) => p.sku === line.sku)!;
        expect(product.shelf === step.shelf || product.shelf === null).toBe(true);
      }
    }
  });

  it("has two shelves on one aisle and stays well under the read cap", () => {
    expect(SHELVES.map((s) => s.name)).toEqual(["Top shelf", "Lower shelf"]);
    expect(SHELVES.every((s) => s.aisle === "Aisle 1")).toBe(true);
    expect(SCRIPT.length).toBeLessThanOrEqual(MAX_READS);
  });

  it("uses the catalogue's own prices", () => {
    expect(SIM_PRODUCTS.find((p) => p.sku === "honey")?.price).toBe("7.00");
    expect(SIM_PRODUCTS.find((p) => p.sku === "eggs")?.price).toBe("4.50");
  });
});

describe("sameScene", () => {
  it("treats the same file as the same scene", () => {
    expect(sameScene("one-jar-before.jpg", "one-jar-before.jpg")).toBe(true);
  });
  it("knows composed pictures that show the same shelf", () => {
    expect(sameScene("one-jar-after.jpg", "put-back-before.jpg")).toBe(true);
    expect(sameScene("put-back-after.jpg", "slid-along-before.jpg")).toBe(true);
  });
  it("keeps different shelves apart", () => {
    expect(sameScene("one-jar-after.jpg", "slid-along-before.jpg")).toBe(false);
  });
});

describe("nextStep and pictureAfter", () => {
  it("walks the script in order and stops at the end", () => {
    expect(nextStep(0)?.id).toBe(SCRIPT[0].id);
    expect(nextStep(SCRIPT.length)).toBeNull();
  });
  it("shows each shelf's latest picture", () => {
    expect(pictureAfter("top", 0)).toBe(SHELVES[0].start);
    expect(pictureAfter("top", 1)).toBe(SCRIPT[0].after);
    expect(pictureAfter("lower", 1)).toBe(SHELVES[1].start);
  });
});

describe("basketChanges and announce", () => {
  const honey = { sku: "honey", name: "Honey", qty: 1, unitCents: 700, lineCents: 700 };
  const eggs = { sku: "eggs", name: "Half-dozen eggs", qty: 2, unitCents: 450, lineCents: 900 };

  it("finds what was added", () => {
    expect(basketChanges([], [honey])).toEqual([{ sku: "honey", name: "Honey", qty: 1 }]);
  });
  it("finds what came off", () => {
    expect(basketChanges([honey, eggs], [eggs])).toEqual([{ sku: "honey", name: "Honey", qty: -1 }]);
  });
  it("is empty when nothing changed", () => {
    expect(basketChanges([honey], [honey])).toEqual([]);
  });
  it("says it plainly", () => {
    expect(announce([{ sku: "honey", name: "Honey", qty: 1 }])).toBe("Honey added to the basket.");
    expect(announce([{ sku: "eggs", name: "Half-dozen eggs", qty: 2 }])).toBe("2 × Half-dozen eggs added to the basket.");
    expect(announce([{ sku: "honey", name: "Honey", qty: -1 }])).toBe("Honey taken off the basket.");
    expect(announce([])).toBe("Nothing changed in the basket.");
  });
});

describe("explainRead", () => {
  it("tells what was sent, what the model answered and what the server priced", () => {
    expect(
      explainRead({ shelfName: "Top shelf", changes: [{ sku: "honey", name: "Honey", qty: 1 }], confidence: 0.97, totalCents: 700 }),
    ).toBe(
      "The top shelf's camera sent two pictures. The vision model answered Honey × 1 with 97% confidence. The server priced the basket at $7.00 from the catalogue.",
    );
  });
  it("covers a put-back and a read with nothing taken", () => {
    expect(
      explainRead({ shelfName: "Top shelf", changes: [{ sku: "honey", name: "Honey", qty: -1 }], confidence: null, totalCents: 900 }),
    ).toBe(
      "The top shelf's camera sent two pictures. The vision model answered Honey put back. The server priced the basket at $9.00 from the catalogue.",
    );
    expect(explainRead({ shelfName: "Top shelf", changes: [], confidence: 0.9, totalCents: 900 })).toBe(
      "The top shelf's camera sent two pictures. The vision model saw nothing leave or come back, so nothing was charged. The basket stays at $9.00.",
    );
  });
});

describe("stepRail", () => {
  it("lights steps from real state", () => {
    expect(stepRail({ store: false, reads: 0, lines: 0, done: false, ownerSeen: false })).toEqual([
      "now", "next", "next", "next", "next",
    ]);
    expect(stepRail({ store: true, reads: 0, lines: 0, done: false, ownerSeen: false })).toEqual([
      "done", "now", "next", "next", "next",
    ]);
    expect(stepRail({ store: true, reads: 1, lines: 1, done: false, ownerSeen: false })).toEqual([
      "done", "done", "done", "now", "next",
    ]);
    expect(stepRail({ store: true, reads: 4, lines: 1, done: true, ownerSeen: true })).toEqual([
      "done", "done", "done", "done", "done",
    ]);
    expect(stepRail({ store: true, reads: 4, lines: 1, done: true, ownerSeen: false })).toEqual([
      "done", "done", "done", "done", "now",
    ]);
  });
});

describe("problems in plain words", () => {
  it("explains the trial limit", () => {
    expect(setupProblem(429, "slow_down")).toMatch(/^Too many sample stores started from this network in the last hour/);
  });
  it("explains a live owner sign-in and a lost connection", () => {
    expect(setupProblem(409, "owner_signed_in")).toMatch(/signed in to a real stand/);
    expect(setupProblem(null, undefined)).toMatch(/connection/);
  });
  it("explains read refusals", () => {
    expect(readProblem(429, "trial_read_limit")).toMatch(/60/);
    expect(readProblem(null, undefined)).toMatch(/connection/);
    expect(readProblem(500, "server_error")).toMatch(/Nothing was charged/);
  });
});
