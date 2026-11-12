import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerAction, ownerOverview } from "@/lib/owner";
import { FileRepo } from "@/lib/repo-file";
import { productsFor } from "@/lib/seed";
import {
  SESSION_IDLE_MS,
  SessionError,
  assignChange,
  authorizeHold,
  checkIn,
  claimPending,
  peekStore,
  editSessionLines,
  finishSession,
  mayReceive,
  sessionView,
  sweepShop,
  type SessionDeps,
} from "@/lib/sessions";
import { handleShelfChange, type ShelfChangeDeps } from "@/lib/stand";
import { saveSettings, saveZones } from "@/lib/store";
import type { Line, Shop } from "@/lib/types";
import { VISIT_ID, expireIfStale, newVisit, newVisitId, type Visit } from "@/lib/visits";
import { FakeHoldPayPal } from "./fake-hold-paypal";

const img = new Uint8Array([1, 2, 3]);
const T0 = 1_000_000;
let repo: FileRepo;
let paypal: FakeHoldPayPal;
let deps: SessionDeps;
let n: number;

const standDeps = (delta: Line[], seen?: (skus: string[]) => void): ShelfChangeDeps => ({
  repo,
  newId: () => `p${++n}`,
  paypal: () => paypal,
  diff: async ({ products }) => {
    seen?.(products.map((p) => p.sku));
    return { delta, confidence: 0.9 };
  },
});
const change = (at: number, extra = {}) => ({
  shop: "live" as Shop, before: img, after: img, changeStartedAt: at, settledAt: at + 1_000, ...extra,
});
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (e) => (e instanceof SessionError ? e.code : `unexpected: ${e}`),
  );
const setMode = (payMode: "after" | "hold" | "choice", holdOverrideCents: number | null = null) =>
  saveSettings(repo, "live", { payMode, holdOverrideCents, holdFloorCents: 1000, holdCapCents: 10_000 });
const enter = async (at = T0, wantsHold = false) => (await checkIn(deps, "live", wantsHold, at)).sessionId;
/** Checks in with a hold and approves it. */
const enterHeld = async (at = T0) => {
  const r = await checkIn(deps, "live", true, at);
  await authorizeHold(deps, r.sessionId, r.hold!.orderId, at + 10);
  return r.sessionId;
};
const stored = async (id: string) => (await repo.getVisit(id))!;

beforeEach(async () => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-session-")));
  paypal = new FakeHoldPayPal();
  deps = { repo, paypal: () => paypal };
  n = 0;
  await repo.resetShop("live", productsFor("live"));
});

describe("visit ids", () => {
  it("are twenty base32 characters and do not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, newVisitId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(VISIT_ID);
    expect("a1b2c3d4").not.toMatch(VISIT_ID);
  });
});

describe("check-in", () => {
  it("opens an empty visit whose id is the session id, with no hold where the shop takes payment after", async () => {
    const r = await checkIn(deps, "live", false, T0);
    expect(r).toEqual({ sessionId: r.sessionId, payMode: "after", holdCents: null });
    expect(r.sessionId).toMatch(VISIT_ID);
    const v = await stored(r.sessionId);
    expect(v).toMatchObject({ status: "open", detected: [], session: { checkedInAt: T0, closedAt: null } });
    expect(paypal.orders).toEqual([]);
  });

  it("makes an AUTHORIZE order for the shop's hold where one is required, without sending the session id to PayPal", async () => {
    await setMode("hold");
    const r = await checkIn(deps, "live", false, T0);
    expect(r.holdCents).toBe(2000);
    expect(r.hold).toEqual({ orderId: "ORDER1", cents: 2000 });
    expect(paypal.orders[0]).toMatchObject({ cents: 2000, intent: "AUTHORIZE" });
    expect(paypal.orders[0].ref).not.toContain(r.sessionId);
    expect((await stored(r.sessionId)).holdOrder).toEqual({ orderId: "ORDER1", cents: 2000 });
  });

  it("lets the shopper choose in a shop that offers both", async () => {
    await setMode("choice", 1500);
    const without = await checkIn(deps, "live", false, T0);
    const withHold = await checkIn(deps, "live", true, T0);
    expect(without).toMatchObject({ payMode: "choice", holdCents: 1500 });
    expect(without.hold).toBeUndefined();
    expect(withHold.hold).toEqual({ orderId: "ORDER1", cents: 1500 });
  });

  it("checks nobody in when PayPal cannot make the hold order", async () => {
    await setMode("hold");
    paypal.fail.create = true;
    expect(await code(checkIn(deps, "live", false, T0))).toBe("paypal_unavailable");
    expect(await repo.listVisits("live")).toEqual([]);
  });
});

describe("peek", () => {
  it("tells the phone the pay mode and hold amount without checking anyone in", async () => {
    expect(await peekStore(repo, "live", T0)).toEqual({ payMode: "after", holdCents: null });
    await setMode("choice", 1500);
    expect(await peekStore(repo, "live", T0)).toEqual({ payMode: "choice", holdCents: 1500 });
    await setMode("hold");
    expect(await peekStore(repo, "live", T0)).toEqual({ payMode: "hold", holdCents: 2000 });
    expect(await repo.listVisits("live")).toEqual([]);
    expect(paypal.orders).toEqual([]);
  });
});

describe("assignChange", () => {
  const session = (id: string, lines: Line[] = [], extra: Partial<Visit> = {}): Visit => ({
    ...newVisit(id, "live", lines, T0), session: { checkedInAt: T0, closedAt: null }, ...extra,
  });
  const take = [{ sku: "honey", qty: 1 }];
  const back = [{ sku: "honey", qty: -1 }];
  const base = { pending: [], anonymousOpen: false, payMode: "after" as const };

  it("is anonymous when nobody is checked in", () => {
    expect(assignChange({ ...base, delta: take, sessions: [] })).toEqual({ to: "anonymous" });
    expect(assignChange({ ...base, delta: back, sessions: [] })).toEqual({ to: "anonymous" });
  });

  it("goes to the one session that may receive items", () => {
    expect(assignChange({ ...base, delta: take, sessions: [session("a")] })).toEqual({ to: "session", id: "a" });
  });

  it("waits as pending when several sessions could have taken it", () => {
    expect(assignChange({ ...base, delta: take, sessions: [session("a"), session("b")] })).toEqual({ to: "pending" });
  });

  it("waits as pending when a hold is required and the only shopper has none yet", () => {
    const waiting = session("a", [], { holdOrder: { orderId: "O", cents: 2000 } });
    expect(assignChange({ ...base, payMode: "hold", delta: take, sessions: [waiting] })).toEqual({ to: "pending" });
    const held = session("b", [], { hold: { orderId: "O", authorizationId: "A", cents: 2000, status: "authorized" } });
    expect(assignChange({ ...base, payMode: "hold", delta: take, sessions: [waiting, held] })).toEqual({ to: "session", id: "b" });
  });

  it("takes put-backs off the open anonymous visit first", () => {
    expect(assignChange({ ...base, anonymousOpen: true, delta: back, sessions: [session("a", take)] })).toEqual({ to: "anonymous" });
  });

  it("takes put-backs off the one session that holds the item", () => {
    const sessions = [session("a", [{ sku: "jam", qty: 1 }]), session("b", take)];
    expect(assignChange({ ...base, delta: back, sessions })).toEqual({ to: "session", id: "b" });
  });

  it("takes put-backs off an unclaimed pending change when no single session holds the item", () => {
    const pending = [{ ...newVisit("p", "live", take, T0), pending: { zoneId: null, claimedBy: null } }];
    const both = [session("a", take), session("b", take)];
    expect(assignChange({ ...base, delta: back, sessions: both, pending })).toEqual({ to: "pending_return", id: "p" });
    expect(assignChange({ ...base, delta: back, sessions: both })).toEqual({ to: "anonymous" });
    expect(assignChange({ ...base, delta: back, sessions: [session("a")] })).toEqual({ to: "anonymous" });
  });

  it("knows which sessions may receive items", () => {
    expect(mayReceive(session("a"), "after")).toBe(true);
    expect(mayReceive(session("a"), "choice")).toBe(true);
    expect(mayReceive(session("a"), "hold")).toBe(false);
    expect(mayReceive(session("a", [], { session: { checkedInAt: T0, closedAt: T0 } }), "after")).toBe(false);
    expect(mayReceive(newVisit("x", "live", [], T0), "after")).toBe(false);
  });
});

describe("shelf changes with shoppers checked in", () => {
  it("behaves as before in a shop where nobody is checked in", async () => {
    const r = await handleShelfChange(standDeps([{ sku: "honey", qty: 2 }]), change(T0));
    expect(r.assigned).toBeUndefined();
    expect(r.visit).toMatchObject({ id: "p1", status: "open" });
    expect(r.visit!.session).toBeUndefined();
    expect(r.visit!.pending).toBeUndefined();
    expect(r.bill!.totalCents).toBe(1400);
  });

  it("puts the change on the one shopper's basket and does not hand their id to the stand", async () => {
    const id = await enter();
    const r = await handleShelfChange(standDeps([{ sku: "honey", qty: 2 }]), change(T0 + 5_000, { zoneId: "zaaaaaa" }));
    expect(r).toEqual({ visit: null, bill: null, assigned: "session" });
    const v = await stored(id);
    expect(v.detected).toEqual([{ sku: "honey", qty: 2 }]);
    expect(v.zoneIds).toEqual(["zaaaaaa"]);
    expect(v.afterUrl).toBeTruthy();
    expect(v.lastSettledAt).toBe(T0 + 6_000);
    expect(await repo.listVisits("live")).toHaveLength(1);
  });

  it("keeps a shopper's own corrections when more is taken or put back", async () => {
    const id = await enter();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 2 }]), change(T0 + 5_000));
    await editSessionLines(deps, id, [{ sku: "honey", qty: 1 }], T0 + 8_000);
    await handleShelfChange(standDeps([{ sku: "jam", qty: 1 }]), change(T0 + 10_000));
    expect((await stored(id)).paid).toEqual([{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }]);
    const back = await handleShelfChange(standDeps([{ sku: "jam", qty: -1 }]), change(T0 + 200_000));
    expect(back).toEqual({ visit: null, bill: null, assigned: "session" });
    expect((await stored(id)).detected).toEqual([{ sku: "honey", qty: 2 }]);
  });

  it("sets the change aside as pending when two shoppers are in, and either can see it", async () => {
    await saveZones(repo, "live", [{ name: "Shelf 3", aisle: "A", order: 0 }], () => "zshelf3");
    const a = await enter(T0);
    const b = await enter(T0 + 100);
    const r = await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000, { zoneId: "zshelf3" }));
    expect(r.assigned).toBe("pending");
    expect(r.visit).toMatchObject({ status: "open", pending: { zoneId: "zshelf3", claimedBy: null }, zoneIds: ["zshelf3"] });
    for (const id of [a, b]) {
      const view = await sessionView(deps, id, T0 + 7_000);
      expect(view.pending).toEqual([
        { id: r.visit!.id, zoneName: "Shelf 3", totalCents: 700, at: T0 + 6_000,
          lines: [{ sku: "honey", name: "Honey", qty: 1, unitCents: 700, lineCents: 700 }] },
      ]);
      expect(view.bill.totalCents).toBe(0);
    }
  });

  it("does not show a shopper changes made before they came in", async () => {
    await enter(T0);
    await enter(T0 + 100);
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    const late = await enter(T0 + 60_000);
    expect((await sessionView(deps, late, T0 + 61_000)).pending).toEqual([]);
    expect(await code(claimPending(deps, late, "p1", T0 + 61_000))).toBe("not_found");
  });

  it("shows the vision model only the zone's products and those kept anywhere", async () => {
    await saveZones(repo, "live", [{ name: "One", aisle: "", order: 0 }, { name: "Two", aisle: "", order: 1 }], (() => {
      const ids = ["zoneone", "zonetwo"];
      return () => ids.shift()!;
    })());
    const products = await repo.listProducts("live");
    await repo.upsertProduct({ ...products.find((p) => p.sku === "honey")!, zoneId: "zoneone" });
    await repo.upsertProduct({ ...products.find((p) => p.sku === "jam")!, zoneId: "zonetwo" });
    let shown: string[] = [];
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }], (skus) => (shown = skus)), change(T0, { zoneId: "zoneone" }));
    expect(shown).toContain("honey");
    expect(shown).not.toContain("jam");
    expect(shown).toContain("bread");
    expect((await repo.getOpenVisit("live"))!.zoneIds).toEqual(["zoneone"]);
    await handleShelfChange(standDeps([], (skus) => (shown = skus)), change(T0 + 2_000));
    expect(shown).toContain("jam");
  });

  it("takes put-backs off an unclaimed pending change", async () => {
    await enter(T0);
    await enter(T0 + 100);
    await handleShelfChange(standDeps([{ sku: "honey", qty: 2 }]), change(T0 + 5_000));
    const r = await handleShelfChange(standDeps([{ sku: "honey", qty: -1 }]), change(T0 + 9_000));
    expect(r.assigned).toBe("pending");
    expect((await stored("p1")).detected).toEqual([{ sku: "honey", qty: 1 }]);
    await handleShelfChange(standDeps([{ sku: "honey", qty: -1 }]), change(T0 + 12_000));
    expect((await stored("p1")).status).toBe("empty");
  });

  it("keeps a change pending while the only shopper has not approved a required hold, then lets them claim it", async () => {
    await setMode("hold");
    const r = await checkIn(deps, "live", false, T0);
    const first = await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    expect(first.assigned).toBe("pending");
    expect(await code(claimPending(deps, r.sessionId, first.visit!.id, T0 + 6_000))).toBe("hold_required");
    expect(await code(editSessionLines(deps, r.sessionId, [{ sku: "jam", qty: 1 }], T0 + 6_000))).toBe("hold_required");
    await authorizeHold(deps, r.sessionId, r.hold!.orderId, T0 + 7_000);
    await claimPending(deps, r.sessionId, first.visit!.id, T0 + 8_000);
    const second = await handleShelfChange(standDeps([{ sku: "jam", qty: 1 }]), change(T0 + 9_000));
    expect(second.assigned).toBe("session");
    expect((await stored(r.sessionId)).detected).toEqual([{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }]);
  });
});

describe("claiming", () => {
  const twoShoppersOnePending = async () => {
    const a = await enter(T0);
    const b = await enter(T0 + 100);
    const r = await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }, { sku: "jam", qty: 2 }]), change(T0 + 5_000));
    return { a, b, pendingId: r.visit!.id };
  };

  it("moves the lines to the first shopper who claims, and the other gets already_claimed", async () => {
    const { a, b, pendingId } = await twoShoppersOnePending();
    const won = await claimPending(deps, a, pendingId, T0 + 8_000);
    expect(won.bill.totalCents).toBe(1900);
    expect(await code(claimPending(deps, b, pendingId, T0 + 8_100))).toBe("already_claimed");
    expect((await stored(a)).detected).toEqual([{ sku: "honey", qty: 1 }, { sku: "jam", qty: 2 }]);
    expect((await stored(b)).detected).toEqual([]);
    expect(await stored(pendingId)).toMatchObject({ status: "empty", pending: { claimedBy: a } });
    expect((await sessionView(deps, b, T0 + 9_000)).pending).toEqual([]);
    expect((await sessionView(deps, a, T0 + 9_000)).bill.totalCents).toBe(1900);
  });

  it("lets exactly one of two claims made at once win", async () => {
    const { a, b, pendingId } = await twoShoppersOnePending();
    const answers = await Promise.all([
      code(claimPending(deps, a, pendingId, T0 + 8_000)),
      code(claimPending(deps, b, pendingId, T0 + 8_000)),
    ]);
    expect(answers.sort()).toEqual(["already_claimed", "no error"]);
    const total = (await stored(a)).detected.length + (await stored(b)).detected.length;
    expect(total).toBe(2);
  });

  it("counts claimed items once in the owner's figures", async () => {
    const { a, pendingId } = await twoShoppersOnePending();
    await claimPending(deps, a, pendingId, T0 + 8_000);
    const overview = await ownerOverview(repo, "live", 7, T0 + 9_000);
    expect(overview.totals.soldCents).toBe(1900);
    expect(overview.totals.unmatchedCents).toBe(0);
    expect(overview.stock.find((s) => s.sku === "jam")!.left).toBe(productsFor("live").find((p) => p.sku === "jam")!.stock - 2);
  });

  it("refuses another shop's pending change, an ordinary visit, and an unknown session", async () => {
    const { a } = await twoShoppersOnePending();
    await repo.saveVisit({ ...newVisit("other", "demo", [{ sku: "honey", qty: 1 }], T0 + 6_000), pending: { zoneId: null, claimedBy: null } });
    await repo.saveVisit(newVisit("plain", "live", [{ sku: "honey", qty: 1 }], T0 + 6_000));
    expect(await code(claimPending(deps, a, "other", T0 + 8_000))).toBe("not_found");
    expect(await code(claimPending(deps, a, "plain", T0 + 8_000))).toBe("not_found");
    expect(await code(claimPending(deps, "plain", "p1", T0 + 8_000))).toBe("not_found");
    expect(await code(claimPending(deps, newVisitId(), "p1", T0 + 8_000))).toBe("not_found");
    expect((await stored("other")).status).toBe("open");
  });

  it("turns an unclaimed pending change into an ordinary unmatched visit after ten minutes", async () => {
    const { a, pendingId } = await twoShoppersOnePending();
    const later = T0 + 6_000 + SESSION_IDLE_MS + 1;
    expect((await sessionView(deps, a, later)).pending).toEqual([]);
    const v = await stored(pendingId);
    expect(v.status).toBe("unmatched");
    expect(v.pending).toBeUndefined();
    expect(await code(claimPending(deps, a, pendingId, later))).not.toBe("no error");
  });
});

describe("the session view", () => {
  it("is 404 for anything that is not a checked-in session", async () => {
    await repo.saveVisit(newVisit("a1b2c3d4", "live", [{ sku: "honey", qty: 1 }], T0));
    const anonymous = newVisitId();
    await repo.saveVisit(newVisit(anonymous, "live", [{ sku: "honey", qty: 1 }], T0));
    for (const id of ["a1b2c3d4", anonymous, newVisitId(), ""]) {
      expect(await code(sessionView(deps, id, T0))).toBe("not_found");
    }
  });

  it("sends only what the phone needs: no photos, order ids or authorization ids", async () => {
    await setMode("choice");
    const id = await enterHeld();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    const view = await sessionView(deps, id, T0 + 7_000);
    expect(view).toEqual({
      status: "open",
      payMode: "choice",
      hold: { cents: 2000, status: "authorized" },
      bill: { lines: [{ sku: "honey", name: "Honey", qty: 1, unitCents: 700, lineCents: 700 }], totalCents: 700 },
      products: productsFor("live").map(({ sku, name, priceCents }) => ({ sku, name, priceCents })),
      pending: [],
      dueCents: 700,
      paidCents: null,
      needsManual: false,
    });
    const text = JSON.stringify(view);
    for (const secret of ["ORDER1", "AUTH-ORDER1", ".jpg", id]) expect(text).not.toContain(secret);
  });

  it("shows the hold order to approve only until it is approved", async () => {
    await setMode("hold");
    const r = await checkIn(deps, "live", false, T0);
    const before = await sessionView(deps, r.sessionId, T0 + 1_000);
    expect(before).toMatchObject({ status: "needs_hold", hold: null, holdOrder: { orderId: "ORDER1", cents: 2000 } });
    await authorizeHold(deps, r.sessionId, "ORDER1", T0 + 2_000);
    const after = await sessionView(deps, r.sessionId, T0 + 3_000);
    expect(after.status).toBe("open");
    expect("holdOrder" in after).toBe(false);
  });
});

describe("authorizing a hold", () => {
  beforeEach(() => setMode("hold"));

  it("records the hold and the money trail, once", async () => {
    const r = await checkIn(deps, "live", false, T0);
    const first = await authorizeHold(deps, r.sessionId, "ORDER1", T0 + 1_000);
    const again = await authorizeHold(deps, r.sessionId, "ORDER1", T0 + 2_000);
    expect(first).toEqual({ hold: { cents: 2000, status: "authorized" } });
    expect(again).toEqual(first);
    expect(paypal.authorized).toHaveLength(1);
    const v = await stored(r.sessionId);
    expect(v.hold).toEqual({ orderId: "ORDER1", authorizationId: "AUTH-ORDER1", cents: 2000, status: "authorized" });
    expect(v.money).toEqual([{ at: T0 + 1_000, kind: "authorized", cents: 2000, ref: "AUTH-ORDER1" }]);
  });

  it("refuses an order this server did not make for this session, and asks PayPal nothing", async () => {
    const a = await checkIn(deps, "live", false, T0);
    const b = await checkIn(deps, "live", false, T0);
    expect(await code(authorizeHold(deps, a.sessionId, b.hold!.orderId, T0 + 1_000))).toBe("hold_mismatch");
    expect(await code(authorizeHold(deps, a.sessionId, "SOMEONE-ELSES", T0 + 1_000))).toBe("hold_mismatch");
    expect(paypal.authorized).toEqual([]);
  });

  it("says so when PayPal declines or cannot be reached, and holds nothing", async () => {
    const r = await checkIn(deps, "live", false, T0);
    paypal.fail.authorize = "refuse";
    expect(await code(authorizeHold(deps, r.sessionId, "ORDER1", T0 + 1_000))).toBe("hold_declined");
    paypal.fail.authorize = "down";
    expect(await code(authorizeHold(deps, r.sessionId, "ORDER1", T0 + 1_000))).toBe("paypal_unavailable");
    expect((await stored(r.sessionId)).hold).toBeUndefined();
  });

  it("releases a hold PayPal made for a different amount, and records both steps", async () => {
    const r = await checkIn(deps, "live", false, T0);
    paypal.authorizeCents = 9_900;
    expect(await code(authorizeHold(deps, r.sessionId, "ORDER1", T0 + 1_000))).toBe("hold_mismatch");
    expect(paypal.voids).toEqual(["AUTH-ORDER1"]);
    const v = await stored(r.sessionId);
    expect(v.hold!.status).toBe("voided");
    expect(v.money!.map((m) => m.kind)).toEqual(["authorized", "voided"]);
  });

  it("records the hold and reports held_but_unrecorded when saving fails after PayPal held the money", async () => {
    const r = await checkIn(deps, "live", false, T0);
    const save = repo.saveVisit.bind(repo);
    let failures = 1;
    repo.saveVisit = async (v) => {
      if (failures-- > 0) throw new Error("disk full");
      return save(v);
    };
    expect(await code(authorizeHold(deps, r.sessionId, "ORDER1", T0 + 1_000))).toBe("held_but_unrecorded");
    expect((await stored(r.sessionId)).money).toEqual([{ at: T0 + 1_000, kind: "authorized", cents: 2000, ref: "AUTH-ORDER1" }]);
  });
});

describe("done", () => {
  it("hands a session without a hold to the pay page", async () => {
    const id = await enter();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    expect(await finishSession(deps, id, T0 + 9_000)).toEqual({ status: "pay", payLink: `/pay/${id}` });
    const v = await stored(id);
    expect(v).toMatchObject({ status: "open", session: { closedAt: T0 + 9_000 } });
    expect(await finishSession(deps, id, T0 + 9_500)).toEqual({ status: "pay", payLink: `/pay/${id}` });
    expect((await sessionView(deps, id, T0 + 9_600)).status).toBe("pay");
    // A closed session takes no more items: the next change is an anonymous one.
    const next = await handleShelfChange(standDeps([{ sku: "jam", qty: 1 }]), change(T0 + 10_000));
    expect(next.assigned).toBeUndefined();
    expect(next.visit!.id).not.toBe(id);
    expect(await code(editSessionLines(deps, id, [], T0 + 11_000))).toBe("session_closed");
  });

  it("keeps a session the shopper cleared for the owner to see: unmatched, adjusted, the camera's lines kept", async () => {
    const id = await enter();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    await editSessionLines(deps, id, [], T0 + 6_000);
    expect(await finishSession(deps, id, T0 + 9_000)).toEqual({ status: "closed" });
    expect(await stored(id)).toMatchObject({ status: "unmatched", adjusted: true, paid: [], detected: [{ sku: "honey", qty: 1 }] });
    const { visits, totals } = await ownerOverview(repo, "live", 7, T0 + 10_000);
    expect(visits.find((v) => v.id === id)).toMatchObject({ status: "unmatched", adjusted: true, detectedCents: 700 });
    expect(totals).toMatchObject({ unmatchedCents: 700, adjustedCents: 0, soldCents: 700 });
  });

  it("closes an empty session without a hold as owing nothing", async () => {
    const id = await enter();
    expect(await finishSession(deps, id, T0 + 9_000)).toEqual({ status: "closed" });
    expect((await stored(id)).status).toBe("empty");
  });

  describe("with a hold", () => {
    beforeEach(() => setMode("hold"));

    it("charges the bill, never more than the hold, with a keyed final capture", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }]), change(T0 + 5_000));
      const r = await finishSession(deps, id, T0 + 9_000);
      expect(r).toMatchObject({ status: "paid", paidCents: 1300, payRest: null });
      expect(paypal.captures).toEqual([
        { authorizationId: "AUTH-ORDER1", cents: 1300, key: "hold-capture-AUTH-ORDER1", final: true },
      ]);
      const v = await stored(id);
      expect(v).toMatchObject({ status: "paid", paidCents: 1300, captureId: "CAP-AUTH-ORDER1", hold: { status: "captured" } });
      expect(v.session!.closedAt).toBe(T0 + 9_000);
      expect(v.money!.map((m) => [m.kind, m.cents, m.ref])).toEqual([
        ["authorized", 2000, "AUTH-ORDER1"],
        ["captured", 1300, "CAP-AUTH-ORDER1"],
      ]);
    });

    it("does not charge twice when Done is tapped twice or asked again later", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      const [a, b] = await Promise.all([finishSession(deps, id, T0 + 9_000), finishSession(deps, id, T0 + 9_000)]);
      const later = await finishSession(deps, id, T0 + 20_000);
      expect(a).toEqual(b);
      expect(later).toEqual(a);
      expect(paypal.captures).toHaveLength(1);
    });

    it("releases the hold when nothing was taken", async () => {
      const id = await enterHeld();
      expect(await finishSession(deps, id, T0 + 9_000)).toMatchObject({ status: "paid", paidCents: 0, payRest: null });
      expect(paypal.voids).toEqual(["AUTH-ORDER1"]);
      expect(paypal.captures).toEqual([]);
      const v = await stored(id);
      expect(v).toMatchObject({ status: "empty", hold: { status: "voided" } });
      expect(v.money!.map((m) => m.kind)).toEqual(["authorized", "voided"]);
      expect((await sessionView(deps, id, T0 + 10_000)).status).toBe("closed");
    });

    it("releases the hold and keeps a cleared basket for the owner as unmatched and adjusted", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      await editSessionLines(deps, id, [], T0 + 6_000);
      await finishSession(deps, id, T0 + 9_000);
      expect(paypal.voids).toEqual(["AUTH-ORDER1"]);
      expect(paypal.captures).toEqual([]);
      expect(await stored(id)).toMatchObject({ status: "unmatched", adjusted: true, paid: [], hold: { status: "voided" } });
    });

    it("captures what fits and moves the rest to a visit of its own for the pay page", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 3 }, { sku: "jam", qty: 1 }]), change(T0 + 5_000));
      const r = await finishSession(deps, id, T0 + 9_000);
      // $20 held: two honey ($14) and the jam ($6) fit; one honey does not.
      expect(r).toMatchObject({ status: "paid", paidCents: 2000 });
      expect(paypal.captures[0].cents).toBe(2000);
      if (r.status !== "paid") throw new Error("not paid");
      const restId = r.payRest!.replace("/pay/", "");
      expect(restId).toMatch(VISIT_ID);
      const rest = await stored(restId);
      expect(rest).toMatchObject({ status: "open", detected: [{ sku: "honey", qty: 1 }] });
      expect(rest.session).toBeUndefined();
      const v = await stored(id);
      expect(v).toMatchObject({ status: "paid", paidCents: 2000, adjusted: false });
      expect(v.detected).toEqual([{ sku: "honey", qty: 2 }, { sku: "jam", qty: 1 }]);
      // Everything taken is counted once.
      expect((await ownerOverview(repo, "live", 7, T0 + 10_000)).totals).toMatchObject({ soldCents: 2700, paidCents: 2000 });
      expect(await finishSession(deps, id, T0 + 11_000)).toEqual(r);
    });

    it("releases the hold and sends the whole bill to the pay page when nothing fits", async () => {
      await setMode("hold", 500);
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      expect(await finishSession(deps, id, T0 + 9_000)).toEqual({ status: "pay", payLink: `/pay/${id}` });
      expect(paypal.voids).toEqual(["AUTH-ORDER1"]);
      expect(paypal.captures).toEqual([]);
    });

    it("stays open and charges nothing when PayPal cannot be reached, then succeeds on the next try with the same key", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      paypal.fail.capture = true;
      expect(await code(finishSession(deps, id, T0 + 9_000))).toBe("paypal_unavailable");
      expect(await stored(id)).toMatchObject({ status: "open", hold: { status: "authorized" }, session: { closedAt: null } });
      paypal.fail.capture = false;
      expect(await finishSession(deps, id, T0 + 9_500)).toMatchObject({ status: "paid", paidCents: 700 });
      expect(paypal.captures.map((c) => c.key)).toEqual(["hold-capture-AUTH-ORDER1"]);
    });

    it("decides the amount once: a retry captures the same amount with the same key, whatever the basket did meanwhile", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      paypal.fail.capture = true;
      expect(await code(finishSession(deps, id, T0 + 9_000))).toBe("paypal_unavailable");
      expect((await stored(id)).hold!.closing).toEqual({ cents: 700, keep: [{ sku: "honey", qty: 1 }], rest: [] });
      await editSessionLines(deps, id, [{ sku: "honey", qty: 2 }], T0 + 9_200);
      paypal.fail.capture = false;
      expect(await finishSession(deps, id, T0 + 9_500)).toMatchObject({ status: "paid", paidCents: 700 });
      expect(paypal.captures).toEqual([{ authorizationId: "AUTH-ORDER1", cents: 700, key: "hold-capture-AUTH-ORDER1", final: true }]);
    });

    it("keeps the capture on the visit and reports captured_but_unrecorded when saving fails after PayPal took the money", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      const save = repo.saveVisit.bind(repo);
      let failures = 1;
      repo.saveVisit = async (v) => {
        if (v.captureId && failures-- > 0) throw new Error("disk full");
        return save(v);
      };
      expect(await code(finishSession(deps, id, T0 + 9_000))).toBe("captured_but_unrecorded");
      const v = await stored(id);
      expect(v.captureId).toBe("CAP-AUTH-ORDER1");
      expect(v.paidCents).toBe(700);
      expect(v.money!.at(-1)).toMatchObject({ kind: "captured", cents: 700 });
      expect(paypal.captures).toHaveLength(1);
      // Asking again never reaches PayPal a second time.
      await finishSession(deps, id, T0 + 9_500).catch(() => {});
      expect(paypal.captures).toHaveLength(1);
    });

    it("lets the owner refund a hold capture from the dashboard", async () => {
      const id = await enterHeld();
      await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
      await finishSession(deps, id, T0 + 9_000);
      const refunded = await ownerAction(repo, paypal, "live", id, { action: "refund", cents: 300 });
      expect(refunded.refundedCents).toBe(300);
    });
  });
});

describe("going idle", () => {
  it("charges a shopper who walked out with money held, the next time the shop is touched", async () => {
    await setMode("hold");
    const id = await enterHeld();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    const idleAt = T0 + 6_000 + SESSION_IDLE_MS + 1;
    await sweepShop(deps, "live", idleAt - 10);
    expect(paypal.captures).toEqual([]);
    await sweepShop(deps, "live", idleAt);
    expect(paypal.captures.map((c) => c.cents)).toEqual([700]);
    expect(await stored(id)).toMatchObject({ status: "paid", paidCents: 700, session: { closedAt: idleAt } });
  });

  it("does the same from a shelf change and from the owner's overview", async () => {
    await setMode("hold");
    const a = await enterHeld();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    const later = T0 + 6_000 + SESSION_IDLE_MS + 1;
    const r = await handleShelfChange(standDeps([{ sku: "jam", qty: 1 }]), change(later));
    expect((await stored(a)).status).toBe("paid");
    // Nobody is checked in any more, so the new change is an anonymous one.
    expect(r.assigned).toBeUndefined();
    expect(r.visit!.detected).toEqual([{ sku: "jam", qty: 1 }]);

    const b = await enterHeld(later);
    await ownerOverview(repo, "live", 7, later + SESSION_IDLE_MS + 100, () => paypal);
    expect((await stored(b)).hold!.status).toBe("voided");
  });

  it("never times out a visit with money held, and closes other idle sessions as empty or unmatched", async () => {
    const late = T0 + SESSION_IDLE_MS + 1;
    const session = { checkedInAt: T0, closedAt: null };
    const held: Visit = {
      ...newVisit("h", "live", [{ sku: "honey", qty: 1 }], T0), session,
      hold: { orderId: "O", authorizationId: "A", cents: 2000, status: "authorized" },
    };
    expect(expireIfStale(held, late)).toBe(held);
    expect(expireIfStale({ ...newVisit("e", "live", [], T0), session }, late)).toMatchObject({
      status: "empty", session: { closedAt: late - 1 },
    });
    expect(expireIfStale({ ...newVisit("u", "live", [{ sku: "honey", qty: 1 }], T0), session }, late)).toMatchObject({
      status: "unmatched", session: { closedAt: late - 1 },
    });
    const plain = newVisit("p", "live", [{ sku: "honey", qty: 1 }], T0);
    expect(expireIfStale(plain, late)).toEqual({ ...plain, status: "unmatched", closedAt: late - 1 });
  });
});

describe("the owner's view of sessions", () => {
  it("carries session, zones, pending and the hold's amount and state, and never PayPal's ids", async () => {
    await setMode("hold");
    const id = await enterHeld();
    await enterHeld(T0 + 50);
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000, { zoneId: "zaaaaaa" }));
    const { visits, totals } = await ownerOverview(repo, "live", 7, T0 + 7_000);
    const row = visits.find((v) => v.id === id)!;
    expect(row.session).toEqual({ checkedInAt: T0, closedAt: null });
    expect(row.hold).toEqual({ cents: 2000, status: "authorized" });
    expect("holdOrder" in row).toBe(false);
    const pending = visits.find((v) => v.pending)!;
    expect(pending).toMatchObject({ pending: { zoneId: "zaaaaaa", claimedBy: null }, zoneIds: ["zaaaaaa"], status: "open" });
    // Young pending changes and empty checked-in visits are not unmatched.
    expect(totals.unmatchedCents).toBe(0);
    expect(JSON.stringify(visits.map((v) => v.hold))).not.toContain("AUTH");
  });
});

describe("saves that fail after PayPal acted", () => {
  beforeEach(() => setMode("hold"));
  const alwaysFail = () => {
    repo.saveVisit = async () => {
      throw new Error("disk full");
    };
  };
  const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");

  it("logs a hold that could not be recorded at all, without the session id, and reports held_but_unrecorded", async () => {
    const r = await checkIn(deps, "live", false, T0);
    alwaysFail();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await code(authorizeHold(deps, r.sessionId, "ORDER1", T0 + 1_000))).toBe("held_but_unrecorded");
      const text = logged(spy);
      expect(text).toMatch(/hold.*could not be saved/);
      expect(text).not.toContain(r.sessionId);
      expect(text).not.toContain("AUTH-ORDER1");
    } finally {
      spy.mockRestore();
    }
  });

  it("logs a capture that could not be recorded at all, without the session id, and reports captured_but_unrecorded", async () => {
    const id = await enterHeld();
    await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    const save = repo.saveVisit.bind(repo);
    repo.saveVisit = async (v) => {
      if (v.hold?.status === "captured") throw new Error("disk full");
      return save(v);
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await code(finishSession(deps, id, T0 + 9_000))).toBe("captured_but_unrecorded");
      const text = logged(spy);
      expect(text).toMatch(/capture.*could not be saved/);
      expect(text).not.toContain(id);
      expect(text).not.toContain("CAP-AUTH-ORDER1");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("a claim won but not saved", () => {
  it("lets the change go back to pending so it can be claimed again", async () => {
    const a = await enter(T0);
    await enter(T0 + 100);
    const r = await handleShelfChange(standDeps([{ sku: "honey", qty: 1 }]), change(T0 + 5_000));
    const pendingId = r.visit!.id;
    const save = repo.saveVisit.bind(repo);
    let failures = 1;
    repo.saveVisit = async (v) => {
      if (v.id === a && failures-- > 0) throw new Error("disk full");
      return save(v);
    };
    await expect(claimPending(deps, a, pendingId, T0 + 8_000)).rejects.toThrow("disk full");
    expect(await stored(pendingId)).toMatchObject({ status: "open", pending: { claimedBy: null } });
    expect((await stored(a)).detected).toEqual([]);
    const won = await claimPending(deps, a, pendingId, T0 + 8_500);
    expect(won.bill.totalCents).toBe(700);
    expect(await stored(pendingId)).toMatchObject({ status: "empty", pending: { claimedBy: a } });
  });
});
