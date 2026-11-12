import { describe, expect, it } from "vitest";
import {
  basketStage,
  byAisle,
  cameraPath,
  claimQuestion,
  doorTokenFromHash,
  enterProblem,
  holdBasisText,
  holdLimit,
  moveZone,
  standZoneFromUrl,
  tintStrength,
} from "@/lib/basket-view";

describe("doorTokenFromHash", () => {
  it("reads the store token after the #", () => {
    expect(doorTokenFromHash("#store=abc.def")).toBe("abc.def");
  });
  it("finds it among other parts", () => {
    expect(doorTokenFromHash("#x=1&store=tok")).toBe("tok");
  });
  it("is null when missing, empty or far too long", () => {
    expect(doorTokenFromHash("")).toBeNull();
    expect(doorTokenFromHash("#store=")).toBeNull();
    expect(doorTokenFromHash("#key=abc")).toBeNull();
    expect(doorTokenFromHash(`#store=${"a".repeat(600)}`)).toBeNull();
  });
});

describe("enterProblem", () => {
  it("says the store is busy", () => {
    expect(enterProblem(429, "store_busy")).toMatch(/busy/);
  });
  it("asks to slow down", () => {
    expect(enterProblem(429, "slow_down")).toMatch(/few/);
  });
  it("says the link is not valid any more for a refused token", () => {
    expect(enterProblem(400, "bad_request")).toMatch(/not valid any more/);
    expect(enterProblem(401, undefined)).toMatch(/not valid any more/);
    expect(enterProblem(404, "not_found")).toMatch(/not valid any more/);
    expect(enterProblem(400, "bad_store")).toMatch(/not valid any more/);
    expect(enterProblem(410, "store_closed")).toMatch(/not valid any more/);
  });
  it("says so when PayPal could not make the hold", () => {
    expect(enterProblem(502, "paypal_unavailable")).toMatch(/PayPal/);
  });
  it("blames the connection when there was no answer", () => {
    expect(enterProblem(null, undefined)).toMatch(/connection/);
  });
  it("has a plain fallback", () => {
    expect(enterProblem(500, "server_error")).toMatch(/Try again/);
  });
});

describe("basketStage", () => {
  const open = { status: "open", payMode: "after" as const, hold: null };
  it("is shopping for an open pay-after session", () => {
    expect(basketStage(open, false)).toBe("shopping");
  });
  it("needs the hold when the store holds first and none is authorized", () => {
    expect(basketStage({ ...open, payMode: "hold" }, false)).toBe("hold");
  });
  it("is shopping once the hold is authorized", () => {
    expect(basketStage({ ...open, payMode: "hold", hold: { cents: 2500, status: "authorized" } }, false)).toBe("shopping");
  });
  it("needs the hold when the shopper chose one and it is waiting", () => {
    expect(basketStage({ ...open, payMode: "choice" }, true)).toBe("hold");
    expect(basketStage({ ...open, payMode: "choice" }, false)).toBe("shopping");
  });
  it("follows the server's own words for a session", () => {
    expect(basketStage({ ...open, status: "needs_hold", payMode: "choice" }, false)).toBe("hold");
    expect(basketStage({ ...open, status: "pay" }, false)).toBe("pay");
    expect(basketStage({ ...open, status: "closed" }, false)).toBe("closed");
  });
  it("is paid for any paid status", () => {
    expect(basketStage({ ...open, status: "paid" }, false)).toBe("paid");
    expect(basketStage({ ...open, status: "paid_adjusted" }, false)).toBe("paid");
  });
  it("is closed for anything else", () => {
    expect(basketStage({ ...open, status: "empty" }, false)).toBe("closed");
    expect(basketStage({ ...open, status: "unmatched" }, false)).toBe("closed");
  });
});

describe("claimQuestion", () => {
  const line = (name: string, qty: number) => ({ sku: name, name, qty, unitCents: 100, lineCents: 100 * qty });
  it("names the shelf and what left", () => {
    expect(claimQuestion({ zoneName: "Shelf 3", lines: [line("Honey", 1)] })).toBe("Shelf 3 saw 1 × Honey leave. Yours?");
  });
  it("joins several items", () => {
    expect(claimQuestion({ zoneName: "Shelf 3", lines: [line("Honey", 1), line("Jam", 2)] })).toBe(
      "Shelf 3 saw 1 × Honey and 2 × Jam leave. Yours?",
    );
    expect(claimQuestion({ zoneName: "A", lines: [line("Honey", 1), line("Jam", 2), line("Tea", 1)] })).toBe(
      "A saw 1 × Honey, 2 × Jam and 1 × Tea leave. Yours?",
    );
  });
  it("says 'A shelf' when the shelf has no name", () => {
    expect(claimQuestion({ zoneName: null, lines: [line("Honey", 1)] })).toBe("A shelf saw 1 × Honey leave. Yours?");
  });
  it("says so when something came back", () => {
    expect(claimQuestion({ zoneName: "Shelf 1", lines: [line("Honey", -1)] })).toBe("Shelf 1 saw 1 × Honey come back. Yours?");
  });
  it("still asks when there are no lines", () => {
    expect(claimQuestion({ zoneName: "Shelf 1", lines: [] })).toBe("Shelf 1 saw something change. Yours?");
  });
});

describe("holdLimit", () => {
  it("is fine well under the hold", () => {
    expect(holdLimit(1000, 2500)).toBe("under");
  });
  it("is near from four fifths of the hold", () => {
    expect(holdLimit(2000, 2500)).toBe("near");
    expect(holdLimit(2500, 2500)).toBe("near");
  });
  it("is over above it", () => {
    expect(holdLimit(2501, 2500)).toBe("over");
  });
  it("is under when there is no hold", () => {
    expect(holdLimit(9900, null)).toBe("under");
  });
});

describe("standZoneFromUrl", () => {
  it("reads the zone from the fragment", () => {
    expect(standZoneFromUrl("#key=k&zone=zabc234", "")).toBe("zabc234");
  });
  it("reads the zone from the query", () => {
    expect(standZoneFromUrl("", "?zone=zabc234")).toBe("zabc234");
  });
  it("prefers the fragment", () => {
    expect(standZoneFromUrl("#zone=zaaaaaa", "?zone=zbbbbbb")).toBe("zaaaaaa");
  });
  it("ignores anything that is not a zone id", () => {
    expect(standZoneFromUrl("#zone=<script>", "")).toBeNull();
    expect(standZoneFromUrl("#zone=zABC189", "")).toBeNull();
    expect(standZoneFromUrl("#key=k", "?angle=2")).toBeNull();
  });
});

describe("cameraPath", () => {
  it("carries a trial key and the zone after the #", () => {
    expect(cameraPath("zabc234", "k.1")).toBe("/stand#key=k.1&zone=zabc234");
  });
  it("uses the query for a stand that types its code", () => {
    expect(cameraPath("zabc234", null)).toBe("/stand?zone=zabc234");
  });
});

describe("byAisle", () => {
  const z = (id: string, aisle: string, order: number) => ({ id, name: id, aisle, order });
  it("groups by aisle in the order aisles first appear, zones by order", () => {
    const groups = byAisle([z("c", "B", 2), z("a", "A", 1), z("b", "A", 0), z("d", "", 3)]);
    expect(groups.map((g) => [g.aisle, g.zones.map((x) => x.id)])).toEqual([
      ["A", ["b", "a"]],
      ["B", ["c"]],
      ["", ["d"]],
    ]);
  });
  it("is empty for no zones", () => {
    expect(byAisle([])).toEqual([]);
  });
});

describe("moveZone", () => {
  const zones = [
    { id: "a", name: "a", aisle: "A", order: 0 },
    { id: "b", name: "b", aisle: "B", order: 1 },
    { id: "c", name: "c", aisle: "A", order: 2 },
  ];
  it("swaps with the next zone in the same aisle and renumbers", () => {
    const moved = moveZone(zones, "a", 1);
    expect(moved.map((z) => [z.id, z.order])).toEqual([
      ["c", 0],
      ["b", 1],
      ["a", 2],
    ]);
  });
  it("leaves the list alone at the end of its aisle", () => {
    expect(moveZone(zones, "c", 1).map((z) => z.id)).toEqual(["a", "b", "c"]);
    expect(moveZone(zones, "a", -1).map((z) => z.id)).toEqual(["a", "b", "c"]);
  });
});

describe("tintStrength", () => {
  it("is 0 with nothing unmatched", () => {
    expect(tintStrength(0, 5000)).toBe(0);
    expect(tintStrength(0, 0)).toBe(0);
  });
  it("is 1 for the largest", () => {
    expect(tintStrength(5000, 5000)).toBe(1);
  });
  it("never drops below a visible floor when something is unmatched", () => {
    expect(tintStrength(1, 100000)).toBe(0.2);
  });
  it("scales in between", () => {
    expect(tintStrength(2500, 5000)).toBe(0.5);
  });
});

describe("holdBasisText", () => {
  it("names the nine in ten when there are enough visits", () => {
    expect(holdBasisText(42, 30)).toBe("Covers 9 in 10 baskets from the last 30 days");
  });
  it("says the minimum is used otherwise", () => {
    expect(holdBasisText(4, 30)).toBe("Not enough visits yet: using twice your minimum");
  });
});
