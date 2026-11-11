import { describe, expect, it } from "vitest";
import {
  type AskData,
  type AskModel,
  type Clock,
  amountsIn,
  answerQuestion,
  dayKey,
  findVisit,
  handleAsk,
  listVisits,
  parseAmount,
  periodTotals,
  refundReport,
  resolveDay,
  shapeAnswer,
  standTools,
  stockReport,
  topSellers,
  unmatchedReport,
} from "@/lib/ask";
import { priceLines } from "@/lib/money";
import type { Totals, VisitRow } from "@/lib/owner";
import { DEMO_PRODUCTS } from "@/lib/seed";
import type { Line } from "@/lib/types";
import { newVisit, type Visit } from "@/lib/visits";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Thursday 12 November 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 10, 12, 12);
const clock: Clock = { now: NOW, days: 7, tzOffset: 0 };

const row = (id: string, at: number, lines: Line[], patch: Partial<Visit> = {}): VisitRow => {
  const detectedBill = priceLines(lines, DEMO_PRODUCTS);
  return { ...newVisit(id, "demo", lines, at), closedAt: at + 60_000, ...patch, detectedBill, detectedCents: detectedBill.totalCents };
};

// honey 700, jam 600, bread 500, eggs 450, apples 400, flowers 800
const visits: VisitRow[] = [
  // Tuesday: honey x2 + bread = 1900, paid in full, 500 refunded
  row("v-paid", Date.UTC(2026, 10, 10, 9), [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], {
    status: "paid",
    paid: [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }],
    paidCents: 1900,
    refundedCents: 500,
    paypalOrderId: "ORDER1",
    captureId: "CAP1",
  }),
  // Tuesday: flowers 800, nobody paid
  row("v-unmatched", Date.UTC(2026, 10, 10, 16), [{ sku: "flowers", qty: 1 }], { status: "unmatched" }),
  // Wednesday: honey x2 seen, honey x1 paid
  row("v-adjusted", Date.UTC(2026, 10, 11, 12), [{ sku: "honey", qty: 2 }], {
    status: "paid_adjusted",
    paid: [{ sku: "honey", qty: 1 }],
    paidCents: 700,
  }),
  // Wednesday: eggs 450, settled in cash
  row("v-settled", Date.UTC(2026, 10, 11, 13), [{ sku: "eggs", qty: 1 }], { status: "settled_other" }),
  // Thursday: apples x3 = 1200, nobody paid
  row("v-unmatched-2", Date.UTC(2026, 10, 12, 8), [{ sku: "apples", qty: 3 }], { status: "unmatched" }),
  // Thursday: everything put back
  row("v-empty", Date.UTC(2026, 10, 12, 9), [], { status: "empty" }),
];

const totals: Totals = { soldCents: 5750, paidCents: 2600, refundedCents: 500, unmatchedCents: 2000, adjustedCents: 700 };

const data: AskData = {
  visits,
  totals,
  stock: [
    { sku: "honey", name: "Honey", left: 2 },
    { sku: "jam", name: "Strawberry jam", left: 6 },
    { sku: "bread", name: "Sourdough loaf", left: 5 },
    { sku: "eggs", name: "Half-dozen eggs", left: 1 },
    { sku: "apples", name: "Bag of apples", left: 3 },
    { sku: "flowers", name: "Bunch of flowers", left: 0 },
  ],
  products: DEMO_PRODUCTS,
  visitors: 9,
};

describe("days", () => {
  it("cuts days in the owner's time zone", () => {
    const at = Date.UTC(2026, 10, 10, 2);
    expect(dayKey(at, 0)).toBe("2026-11-10");
    // Five hours behind UTC it is still the evening before.
    expect(dayKey(at, 300)).toBe("2026-11-09");
  });

  it("resolves plain words to a date", () => {
    expect(resolveDay("today", clock)).toBe("2026-11-12");
    expect(resolveDay("Yesterday", clock)).toBe("2026-11-11");
    expect(resolveDay("tuesday", clock)).toBe("2026-11-10");
    expect(resolveDay("Tue", clock)).toBe("2026-11-10");
    expect(resolveDay("thursday", clock)).toBe("2026-11-12");
    expect(resolveDay("friday", clock)).toBe("2026-11-06");
    expect(resolveDay("2026-11-09", clock)).toBe("2026-11-09");
    expect(resolveDay("the day of the fair", clock)).toBeNull();
  });
});

describe("periodTotals", () => {
  it("reports the dashboard's own figures as formatted money", () => {
    const { facts, lines, sources } = periodTotals(data, clock);
    expect(facts).toMatchObject({
      period_days: 7,
      visits: 5,
      paid_visits: 2,
      unmatched_visits: 2,
      left_the_shelf: "$57.50",
      paid_through_paypal: "$26.00",
      refunded: "$5.00",
      paid_after_refunds: "$21.00",
      unmatched: "$20.00",
      adjusted_by_customers: "$7.00",
      settled_another_way: "$4.50",
      still_open: "$0.00",
      people_stopped_by: 9,
    });
    expect(lines.join(" ")).toContain("$21.00");
    expect(sources).toEqual([{ kind: "totals", label: "Totals, last 7 days" }]);
  });
});

describe("listVisits", () => {
  it("lists every visit where something left the shelf, newest first", () => {
    const { facts } = listVisits(data, clock, {});
    const f = facts as { count: number; visits: { id: string }[] };
    expect(f.count).toBe(5);
    expect(f.visits.map((v) => v.id)).toEqual(["v-unmatched-2", "v-settled", "v-adjusted", "v-unmatched", "v-paid"]);
  });

  it("filters by status, day and item, and adds up what it lists", () => {
    const paid = listVisits(data, clock, { status: "paid" }).facts as { count: number; total_paid: string };
    expect(paid.count).toBe(2);
    expect(paid.total_paid).toBe("$26.00");

    const tuesday = listVisits(data, clock, { day: "tuesday" }).facts as { count: number; day: string; total_shelf_value: string };
    expect(tuesday).toMatchObject({ count: 2, day: "2026-11-10", total_shelf_value: "$27.00" });

    const honey = listVisits(data, clock, { item: "HONEY" }).facts as { count: number };
    expect(honey.count).toBe(2);
  });

  it("describes one visit in full", () => {
    const { facts, sources } = listVisits(data, clock, { status: "paid", day: "2026-11-10" });
    expect((facts as { visits: unknown[] }).visits[0]).toEqual({
      id: "v-paid",
      when: "Tue 10 Nov, 09:00",
      day: "2026-11-10",
      status: "Paid",
      items: "2 × Honey, 1 × Sourdough loaf",
      shelf_value: "$19.00",
      paid: "$19.00",
      refunded: "$5.00",
      paypal_order_on_record: true,
    });
    expect(sources).toEqual([{ kind: "visit", id: "v-paid", label: "Tue 10 Nov, 09:00" }]);
  });

  it("says so when the day is not understood", () => {
    const { facts, sources } = listVisits(data, clock, { day: "pancake day" });
    expect(facts).toMatchObject({ error: "day_not_understood" });
    expect(sources).toEqual([]);
  });
});

describe("topSellers", () => {
  it("ranks by units that left the shelf, then by value", () => {
    const { facts, lines } = topSellers(data, "units", 3);
    expect((facts as { products: unknown[] }).products).toEqual([
      { name: "Honey", units_left_shelf: 4, units_paid_for: 3, shelf_value: "$28.00" },
      { name: "Bag of apples", units_left_shelf: 3, units_paid_for: 0, shelf_value: "$12.00" },
      { name: "Bunch of flowers", units_left_shelf: 1, units_paid_for: 0, shelf_value: "$8.00" },
    ]);
    expect(lines[0]).toContain("Honey");
  });

  it("counts a visit paid in full as paid for what the camera saw", () => {
    const bare = { ...data, visits: [{ ...visits[0], paid: null }] };
    expect((topSellers(bare, "units", 1).facts as { products: unknown[] }).products).toEqual([
      { name: "Honey", units_left_shelf: 2, units_paid_for: 2, shelf_value: "$14.00" },
    ]);
  });

  it("ranks by value", () => {
    const names = (topSellers(data, "value", 6).facts as { products: { name: string }[] }).products.map((p) => p.name);
    expect(names).toEqual(["Honey", "Bag of apples", "Bunch of flowers", "Sourdough loaf", "Half-dozen eggs"]);
  });

  it("has nothing to rank when nothing left the shelf", () => {
    const { facts } = topSellers({ ...data, visits: [] }, "units", 5);
    expect((facts as { products: unknown[] }).products).toEqual([]);
  });
});

describe("stockReport", () => {
  it("lists what is left and what is running low", () => {
    const { facts, sources } = stockReport(data);
    const f = facts as { products: { name: string; left: number; price: string }[]; running_low: string[] };
    expect(f.products[0]).toEqual({ name: "Honey", left: 2, price: "$7.00" });
    expect(f.running_low).toEqual(["Half-dozen eggs", "Bunch of flowers"]);
    expect(sources).toEqual([{ kind: "stock", label: "Shelf" }]);
  });
});

describe("unmatchedReport", () => {
  it("lists unmatched visits with the dashboard's total", () => {
    const { facts, sources } = unmatchedReport(data, clock);
    expect(facts).toMatchObject({ count: 2, total_unmatched: "$20.00" });
    expect(sources.map((s) => s.id)).toEqual(["v-unmatched-2", "v-unmatched"]);
  });
});

describe("refundReport", () => {
  it("lists refunds and their total", () => {
    const { facts, sources } = refundReport(data, clock);
    expect(facts).toMatchObject({ count: 1, total_refunded: "$5.00" });
    expect(sources).toEqual([
      { kind: "refunds", label: "Refunds" },
      { kind: "visit", id: "v-paid", label: "Tue 10 Nov, 09:00" },
    ]);
  });

  it("reports none as none", () => {
    const none = { ...data, visits: visits.map((v) => ({ ...v, refundedCents: 0 })), totals: { ...totals, refundedCents: 0 } };
    expect(refundReport(none, clock).facts).toMatchObject({ count: 0, total_refunded: "$0.00" });
  });
});

describe("findVisit", () => {
  it("reads an amount in plain words", () => {
    expect(parseAmount("$19")).toBe(1900);
    expect(parseAmount("19.5")).toBe(1950);
    expect(parseAmount(" 4.50 ")).toBe(450);
    expect(parseAmount("1,200.00")).toBe(120000);
    expect(parseAmount("a lot")).toBeNull();
    expect(parseAmount("19.999")).toBeNull();
  });

  it("finds a visit by id", () => {
    const { facts } = findVisit(data, clock, { id: "v-settled" });
    expect(facts).toMatchObject({ count: 1 });
    expect((facts as { visits: { status: string }[] }).visits[0].status).toBe("Settled another way");
  });

  it("finds a visit by amount and day", () => {
    const hit = findVisit(data, clock, { amount: "$19", day: "tuesday" });
    expect(hit.facts).toMatchObject({ count: 1, amount: "$19.00", day: "2026-11-10" });
    expect(hit.sources.map((s) => s.id)).toEqual(["v-paid"]);
    // The same amount on another day is a different question.
    expect(findVisit(data, clock, { amount: "19", day: "wednesday" }).facts).toMatchObject({ count: 0 });
  });

  it("matches the paid amount as well as the shelf value", () => {
    // v-adjusted: $14.00 on the shelf, $7.00 paid.
    expect(findVisit(data, clock, { amount: "7" }).sources.map((s) => s.id)).toEqual(["v-adjusted"]);
  });

  it("needs something to look for", () => {
    expect(findVisit(data, clock, {}).facts).toMatchObject({ error: "nothing_to_look_for" });
    expect(findVisit(data, clock, { amount: "lots" }).facts).toMatchObject({ error: "amount_not_understood" });
  });
});

describe("amountsIn", () => {
  it("finds every money amount in a text, in cents", () => {
    expect(amountsIn("You took $21.00 after $5 back, and 12 dollars more. 3 visits.")).toEqual([2100, 500, 1200]);
    expect(amountsIn("$1,250.50 and USD 4.5")).toEqual([125050, 450]);
    expect(amountsIn("no money here, 7 days")).toEqual([]);
  });
});

describe("shapeAnswer", () => {
  const results = [periodTotals(data, clock)];

  it("passes an answer whose amounts all come from the tools", () => {
    const out = shapeAnswer("You took **$21.00** after refunds of $5.00.", { question: "How much?", results });
    expect(out).toEqual({ answer: "You took $21.00 after refunds of $5.00.", checked: true });
  });

  it("accepts an amount the owner typed themselves", () => {
    const out = shapeAnswer("I could not find a $19 payment on that day.", { question: "Did the $19 payment go through?", results: [] });
    expect(out.checked).toBe(true);
  });

  it("replaces an answer holding an amount no tool returned with the raw facts", () => {
    const out = shapeAnswer("You took $99.00 this week.", { question: "How much?", results });
    expect(out.checked).toBe(false);
    expect(out.answer).not.toContain("$99.00");
    expect(out.answer).toContain("$21.00");
    expect(out.answer.startsWith("Here is what the records show.")).toBe(true);
  });

  it("has a plain fallback when no tool was used", () => {
    expect(shapeAnswer("Probably about $40.", { question: "How much?", results: [] })).toEqual({
      answer: "I could not find that in this stand's records.",
      checked: false,
    });
    expect(shapeAnswer("   ", { question: "How much?", results: [] }).checked).toBe(false);
  });

  it("never passes on an accusation", () => {
    const out = shapeAnswer("That looks like theft worth $20.00.", { question: "What is unmatched?", results });
    expect(out.checked).toBe(false);
    expect(out.answer.toLowerCase()).not.toContain("theft");
  });

  it("flattens markdown and keeps the answer short", () => {
    const out = shapeAnswer("## Summary\n- one\n- two\n\n| a | b |", { question: "q", results });
    expect(out.answer).toBe("Summary one two a b");
    expect(shapeAnswer("word ".repeat(400), { question: "q", results }).answer.length).toBeLessThanOrEqual(700);
  });
});

describe("standTools", () => {
  it("offers only tools that read, each with a schema", () => {
    const tools = standTools(data, clock);
    expect(tools.map((t) => t.name)).toEqual([
      "period_totals",
      "list_visits",
      "top_sellers",
      "stock_left",
      "unmatched_visits",
      "refunds",
      "find_visit",
    ]);
    for (const t of tools) expect(t.schema.safeParse({}).success).toBe(true);
  });

  it("refuses arguments outside the schema", () => {
    const list = standTools(data, clock).find((t) => t.name === "list_visits");
    expect(list?.schema.safeParse({ status: "stolen" }).success).toBe(false);
  });
});

describe("answerQuestion", () => {
  it("gives the model the tools and returns its answer with the facts used", async () => {
    let seen = "";
    const model: AskModel = async ({ instructions, prompt, tools }) => {
      seen = `${instructions}\n${prompt}`;
      await tools.find((t) => t.name === "unmatched_visits")?.run({});
      await tools.find((t) => t.name === "period_totals")?.run({});
      await tools.find((t) => t.name === "period_totals")?.run({});
      return { text: "Two visits are unmatched, worth $20.00." };
    };
    const out = await answerQuestion({ model }, { data, clock, question: "What is unmatched?" });
    expect(out.answer).toBe("Two visits are unmatched, worth $20.00.");
    expect(out.checked).toBe(true);
    expect(out.sources).toEqual([
      { kind: "visit", id: "v-unmatched-2", label: "Thu 12 Nov, 08:00" },
      { kind: "visit", id: "v-unmatched", label: "Tue 10 Nov, 16:00" },
      { kind: "totals", label: "Totals, last 7 days" },
    ]);
    expect(seen).toContain("What is unmatched?");
    expect(seen).toContain("unmatched");
    expect(seen).not.toMatch(/passcode: |demo-secret/);
  });

  it("falls back to the facts when the model invents money", async () => {
    const model: AskModel = async ({ tools }) => {
      await tools[0].run({});
      return { text: "You made $1,000.00." };
    };
    const out = await answerQuestion({ model }, { data, clock, question: "How much?" });
    expect(out.checked).toBe(false);
    expect(out.answer).toContain("$21.00");
    expect(out.answer).not.toContain("1,000");
  });

  it("turns a tool that throws into a fact the model can read", async () => {
    const model: AskModel = async ({ tools }) => {
      const result = await tools.find((t) => t.name === "broken")?.run({});
      return { text: JSON.stringify(result?.facts) };
    };
    const broken = { name: "broken", description: "", schema: standTools(data, clock)[0].schema, run: () => Promise.reject(new Error("secret detail")) };
    const out = await answerQuestion({ model, extraTools: [broken] }, { data, clock, question: "q" });
    expect(out.answer).toContain("lookup_failed");
    expect(out.answer).not.toContain("secret detail");
  });
});

describe("handleAsk", () => {
  const model: AskModel = async ({ tools }) => {
    await tools[0].run({});
    return { text: "You took $21.00 after refunds." };
  };
  const make = (over: Partial<Parameters<typeof handleAsk>[0]> = {}) => {
    const calls = { model: 0, load: 0 };
    const deps = {
      model: (async (input) => {
        calls.model++;
        return model(input);
      }) as AskModel,
      load: async () => {
        calls.load++;
        return data;
      },
      allow: () => true,
      now: () => NOW,
      cache: new Map(),
      ...over,
    };
    return { deps, calls };
  };
  const req = (body: unknown, shop: "demo" | "live" = "demo") => ({ shop, ip: "1.2.3.4", body });

  it("answers a question", async () => {
    const { deps } = make();
    const res = await handleAsk(deps, req({ question: "How much did I take?", days: 7 }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      answer: "You took $21.00 after refunds.",
      sources: [{ kind: "totals", label: "Totals, last 7 days" }],
      checked: true,
    });
  });

  it("rejects a bad body before any model call", async () => {
    const { deps, calls } = make();
    const bad = [
      null,
      "text",
      {},
      { days: 7 },
      { question: "", days: 7 },
      { question: "   ", days: 7 },
      { question: "x".repeat(301), days: 7 },
      { question: "ok", days: 2 },
      { question: "ok", days: "7" },
      { question: "ok" },
      { question: 5, days: 7 },
      { question: "ok", days: 7, tzOffset: 100_000 },
      { brief: false, days: 7 },
    ];
    for (const body of bad) {
      const res = await handleAsk(deps, req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toMatchObject({ error: "bad_request" });
    }
    expect(calls).toEqual({ model: 0, load: 0 });
  });

  it("accepts each period and a question of exactly 300 characters", async () => {
    const { deps } = make();
    for (const days of [1, 7, 30]) {
      expect((await handleAsk(deps, req({ question: "x".repeat(300), days, tzOffset: -330 }))).status).toBe(200);
    }
  });

  it("limits a real stand per minute and per day", async () => {
    const asked: [string, number, number][] = [];
    const { deps } = make({ allow: (key, max, windowMs) => (asked.push([key, max, windowMs]), true) });
    await handleAsk(deps, req({ question: "q", days: 7 }, "live"));
    expect(asked).toEqual([
      ["ask:minute:live", 10, 60_000],
      ["ask:day:live", 100, DAY],
    ]);
  });

  it("limits the demo stand per visitor and overall", async () => {
    const asked: [string, number, number][] = [];
    const { deps } = make({ allow: (key, max, windowMs) => (asked.push([key, max, windowMs]), true) });
    await handleAsk(deps, req({ question: "q", days: 7 }));
    expect(asked).toEqual([
      ["ask:minute:demo:1.2.3.4", 5, 60_000],
      ["ask:day:demo", 200, DAY],
    ]);
  });

  it("answers 429 with a clear message when over the limit", async () => {
    const { deps, calls } = make({ allow: () => false });
    const res = await handleAsk(deps, req({ question: "q", days: 7 }));
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: "rate_limited", message: "That is a lot of questions at once. Try again in a minute." });
    expect(calls.model).toBe(0);

    const day = await handleAsk(make({ allow: (key) => !key.startsWith("ask:day") }).deps, req({ question: "q", days: 7 }));
    expect(day.body).toMatchObject({ error: "rate_limited", message: "This stand has reached today's limit for questions. Try again tomorrow." });
  });

  it("says so when the model fails, without the reason", async () => {
    const { deps } = make({ model: () => Promise.reject(new Error("key sk-123 rejected")) });
    const res = await handleAsk(deps, req({ question: "q", days: 7 }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("sk-123");
    expect(res.body).toMatchObject({ error: "model_failed" });
  });

  it("writes the brief once and serves it from memory for a few minutes", async () => {
    let now = NOW;
    const { deps, calls } = make({ now: () => now });
    const first = await handleAsk(deps, req({ brief: true, days: 7 }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ answer: "You took $21.00 after refunds." });

    now += 60_000;
    const again = await handleAsk(deps, req({ brief: true, days: 7 }));
    expect(again.body).toEqual(first.body);
    expect(calls.model).toBe(1);

    // Another period and another stand each get their own.
    await handleAsk(deps, req({ brief: true, days: 30 }));
    await handleAsk(deps, req({ brief: true, days: 7 }, "live"));
    expect(calls.model).toBe(3);

    // Times are written for the owner's time zone, so another zone is not served this one's.
    await handleAsk(deps, req({ brief: true, days: 7, tzOffset: -330 }));
    expect(calls.model).toBe(4);

    now += 6 * 60_000;
    await handleAsk(deps, req({ brief: true, days: 7 }));
    expect(calls.model).toBe(5);
  });

  it("does not keep a brief that failed its check", async () => {
    let asked = 0;
    const { deps } = make({ model: async () => (asked++, { text: "You made $5,000." }) });
    await handleAsk(deps, req({ brief: true, days: 7 }));
    await handleAsk(deps, req({ brief: true, days: 7 }));
    expect(asked).toBe(2);
  });

  it("a cached brief does not use up the limit", async () => {
    let allowed = 0;
    const { deps } = make({ allow: () => (allowed++, true) });
    await handleAsk(deps, req({ brief: true, days: 7 }));
    const after = allowed;
    await handleAsk(deps, req({ brief: true, days: 7 }));
    expect(allowed).toBe(after);
  });
});
