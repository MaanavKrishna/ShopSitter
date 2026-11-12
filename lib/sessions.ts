// A shopper's session: check in at the door, a basket that fills as shelves are read, shelf
// changes claimed when several shoppers are in, and a PayPal hold charged for what was taken.
// A session is a visit with `session` set; its id is the only secret the shopper holds.
import { createHash } from "node:crypto";
import { CheckoutError, editLines } from "./checkout";
import { holdBasis, splitForHold, suggestedHoldCents } from "./hold";
import { priceLines } from "./money";
import { PayPalRefused, buildHoldOrderBody, getGateway, type HoldGateway } from "./paypal";
import type { Repo } from "./repo";
import { getStore, type PayMode, type StoreSettings } from "./store";
import type { Line, PricedBill, Shop } from "./types";
import {
  OPEN_TIMEOUT_MS,
  VISIT_ID,
  closeZeroBill,
  expireIfStale,
  mergeLines,
  newVisit,
  newVisitId,
  settlePayment,
  type MoneyEvent,
  type Visit,
} from "./visits";

export type SessionErrorCode =
  | "not_found"
  | "bad_store"
  | "store_closed"
  | "session_closed"
  | "hold_required"
  | "hold_mismatch"
  | "hold_declined"
  | "already_claimed"
  | "paypal_unavailable"
  /** PayPal set the money aside but it could not be recorded here. */
  | "held_but_unrecorded"
  /** PayPal took the payment but it could not be recorded here: money has moved. */
  | "captured_but_unrecorded";

export const SESSION_ERROR_STATUS: Record<SessionErrorCode, number> = {
  not_found: 404,
  bad_store: 400,
  store_closed: 410,
  session_closed: 409,
  hold_required: 409,
  hold_mismatch: 409,
  hold_declined: 409,
  already_claimed: 409,
  paypal_unavailable: 502,
  held_but_unrecorded: 500,
  captured_but_unrecorded: 500,
};

export class SessionError extends Error {
  constructor(public code: SessionErrorCode) {
    super(code);
  }
}

export type SessionDeps = { repo: Repo; paypal: () => HoldGateway; newId?: () => string };

/** A session with no shelf change, claim or correction for this long is closed. */
export const SESSION_IDLE_MS = OPEN_TIMEOUT_MS;

export const isSessionId = (id: string) => VISIT_ID.test(id);

/** A checked-in visit whose shopper has not finished. */
export const isOpenSession = (v: Visit) => v.status === "open" && !!v.session && v.session.closedAt === null;

/**
 * Whether shelf changes may go onto this session. Where the shop requires a hold, and for a
 * shopper who chose one, only once the hold is authorized.
 */
export function mayReceive(v: Visit, payMode: PayMode): boolean {
  if (!isOpenSession(v)) return false;
  if (v.hold) return v.hold.status === "authorized";
  return payMode !== "hold" && !v.holdOrder;
}

export type Assignment =
  | { to: "anonymous" }
  | { to: "session"; id: string }
  | { to: "pending" }
  /** Items put back that belong to an unclaimed pending change. */
  | { to: "pending_return"; id: string };

/**
 * Decides whose a shelf change is.
 *  - Nobody is checked in: an anonymous visit, as on a stand without a door.
 *  - Items taken: the one session that may receive items gets them; with none or several, the
 *    change waits as pending for a shopper to claim.
 *  - Items only put back: they come off the open anonymous visit when there is one; else off the
 *    one session holding any of them; else off the newest unclaimed pending change holding them;
 *    else they are handled as on a stand without a door (taken off a recent unmatched visit).
 */
export function assignChange(input: {
  delta: Line[];
  /** Open checked-in sessions in the shop. */
  sessions: Visit[];
  /** Unclaimed pending changes, newest first. */
  pending: Visit[];
  anonymousOpen: boolean;
  payMode: PayMode;
}): Assignment {
  const { delta, sessions, pending } = input;
  if (sessions.length === 0 || delta.length === 0) return { to: "anonymous" };
  const onlyReturns = delta.every((d) => d.qty < 0);
  if (onlyReturns) {
    if (input.anonymousOpen) return { to: "anonymous" };
    const skus = new Set(delta.map((d) => d.sku));
    const holds = (v: Visit) => (v.paid ?? v.detected).some((l) => skus.has(l.sku)) || v.detected.some((l) => skus.has(l.sku));
    const holders = sessions.filter(holds);
    if (holders.length === 1) return { to: "session", id: holders[0].id };
    const waiting = pending.find(holds);
    return waiting ? { to: "pending_return", id: waiting.id } : { to: "anonymous" };
  }
  const receivers = sessions.filter((v) => mayReceive(v, input.payMode));
  return receivers.length === 1 ? { to: "session", id: receivers[0].id } : { to: "pending" };
}

/** A session's visit after a shelf change that is the shopper's. Their own corrections are kept and moved with it. */
export function addToSession(v: Visit, delta: Line[], at: number, zoneId: string | null | undefined): Visit {
  const zoneIds = zoneId && !(v.zoneIds ?? []).includes(zoneId) ? [...(v.zoneIds ?? []), zoneId] : v.zoneIds;
  return {
    ...v,
    detected: mergeLines(v.detected, delta),
    paid: v.paid ? mergeLines(v.paid, delta) : null,
    paypalOrderId: null,
    orderCents: null,
    lastSettledAt: at,
    ...(zoneIds ? { zoneIds } : {}),
  };
}

/** Stands for a session in PayPal's records without being its id. */
const holdRef = (sessionId: string) => createHash("sha256").update(`hold-ref:${sessionId}`).digest("hex").slice(0, 20);

/** A short, one-way stand-in for a session id in the server's logs. */
export const logRef = (sessionId: string) => createHash("sha256").update(`log:${sessionId}`).digest("hex").slice(0, 8);
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const event = (at: number, kind: MoneyEvent["kind"], cents: number, ref: string): MoneyEvent => ({ at, kind, cents, ref });

async function settingsOf(repo: Repo, shop: Shop): Promise<StoreSettings> {
  return (await getStore(repo, shop)).settings;
}

/** The hold this shop asks for right now, from what its shoppers paid in the last 30 days. */
export async function holdCentsFor(repo: Repo, shop: Shop, settings: StoreSettings, now: number): Promise<number> {
  return suggestedHoldCents(holdBasis(await repo.listVisits(shop), now), settings);
}

/** What the phone needs to know before checking in: how this shop takes payment, and the hold it would ask for. */
export async function peekStore(repo: Repo, shop: Shop, now: number) {
  const settings = await settingsOf(repo, shop);
  const holdCents = settings.payMode === "after" ? null : await holdCentsFor(repo, shop, settings, now);
  return { payMode: settings.payMode, holdCents };
}

/**
 * Checks a shopper in: a new open visit with no lines whose id is their session id. Where a hold
 * is required, or the shopper chose one, a PayPal order with intent AUTHORIZE is made for the
 * shop's hold amount and returned for the phone to approve.
 */
export async function checkIn(deps: SessionDeps, shop: Shop, wantsHold: boolean, now: number) {
  const { repo } = deps;
  const settings = await settingsOf(repo, shop);
  const withHold = settings.payMode === "hold" || (settings.payMode === "choice" && wantsHold);
  const holdCents = settings.payMode === "after" ? null : await holdCentsFor(repo, shop, settings, now);
  const id = (deps.newId ?? newVisitId)();
  let visit: Visit = { ...newVisit(id, shop, [], now), session: { checkedInAt: now, closedAt: null } };
  if (withHold && holdCents !== null) {
    let orderId: string;
    try {
      ({ orderId } = await deps.paypal().createOrder(buildHoldOrderBody(holdCents, holdRef(id))));
    } catch (e) {
      console.error("hold order could not be made", e instanceof Error ? e.message : e);
      throw new SessionError("paypal_unavailable");
    }
    visit = { ...visit, holdOrder: { orderId, cents: holdCents } };
  }
  await repo.saveVisit(visit);
  return {
    sessionId: id,
    payMode: settings.payMode,
    holdCents,
    ...(visit.holdOrder ? { hold: { orderId: visit.holdOrder.orderId, cents: visit.holdOrder.cents } } : {}),
  };
}

async function loadSession(repo: Repo, id: string): Promise<Visit> {
  const visit = isSessionId(id) ? await repo.getVisit(id) : null;
  if (!visit || !visit.session) throw new SessionError("not_found");
  return visit;
}

const publicHold = (v: Visit) => (v.hold ? { cents: v.hold.cents, status: v.hold.status } : null);
const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

/** Unclaimed pending changes a session may claim: made in its shop after it checked in. */
const claimableBy = (session: Visit) => (v: Visit) =>
  v.status === "open" && !!v.pending && v.pending.claimedBy === null && v.shop === session.shop &&
  v.openedAt >= session.session!.checkedInAt;

export type SessionStatus = "needs_hold" | "open" | "pay" | "paid" | "closed";

function statusOf(v: Visit, payMode: PayMode): SessionStatus {
  if (isPaid(v)) return "paid";
  if (isOpenSession(v)) return mayReceive(v, payMode) ? "open" : "needs_hold";
  // Finished without a hold and still owing: the pay page takes over.
  return v.status === "open" || v.status === "unmatched" ? "pay" : "closed";
}

/** Everything the shopper's phone shows. Nothing here names a photo, an authorization or another shopper. */
export async function sessionView(deps: SessionDeps, id: string, now: number) {
  const { repo } = deps;
  const first = await loadSession(repo, id);
  await sweepShop(deps, first.shop, now);
  const visit = (await repo.getVisit(id)) ?? first;
  const [catalogue, store] = await Promise.all([
    repo.listProducts(visit.shop, { includeArchived: true }),
    getStore(repo, visit.shop),
  ]);
  const bill = priceLines(visit.paid ?? visit.detected, catalogue);
  const status = statusOf(visit, store.settings.payMode);
  const zoneName = (zoneId: string | null) => store.zones.find((z) => z.id === zoneId)?.name ?? null;
  const pending =
    status === "open" || status === "needs_hold"
      ? (await repo.listOpenVisits(visit.shop)).filter(claimableBy(visit)).map((p) => {
          const priced = priceLines(p.detected, catalogue);
          return { id: p.id, zoneName: zoneName(p.pending!.zoneId), lines: priced.lines, totalCents: priced.totalCents, at: p.openedAt };
        })
      : [];
  return {
    status,
    payMode: store.settings.payMode,
    hold: publicHold(visit),
    // Only while the hold still has to be approved: the one order the PayPal button needs.
    ...(status === "needs_hold" && visit.holdOrder && !visit.hold ? { holdOrder: visit.holdOrder } : {}),
    bill,
    products: catalogue.filter((p) => !p.archived).map(({ sku, name, priceCents }) => ({ sku, name, priceCents })),
    pending,
    dueCents: status === "paid" || status === "closed" ? 0 : bill.totalCents,
    paidCents: visit.paidCents,
    needsManual: visit.needsManual,
    ...(status === "pay" ? { payLink: `/pay/${visit.id}` } : {}),
    ...(visit.session?.restId ? { payRest: `/pay/${visit.session.restId}` } : {}),
  };
}

// One PayPal write at a time per session, so a double tap cannot reach PayPal twice.
const inFlight = new Map<string, Promise<unknown>>();
function once<T>(key: string, work: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const mine = work().finally(() => inFlight.delete(key));
  inFlight.set(key, mine);
  return mine;
}

/**
 * The shopper approved the hold order with the PayPal button: PayPal is asked to set the money
 * aside and the hold is recorded. Asking again for a hold already recorded answers the same.
 */
export function authorizeHold(deps: SessionDeps, id: string, orderId: string, now: number) {
  return once(`hold:${id}`, async () => {
    const { repo } = deps;
    const visit = await loadSession(repo, id);
    if (visit.hold) {
      if (visit.hold.orderId !== orderId) throw new SessionError("hold_mismatch");
      return { hold: publicHold(visit)! };
    }
    if (!isOpenSession(visit)) throw new SessionError("session_closed");
    // Only the order this server made for this session, for the amount it chose.
    if (!visit.holdOrder || visit.holdOrder.orderId !== orderId) throw new SessionError("hold_mismatch");

    const paypal = deps.paypal();
    let result: { authorizationId: string; amountCents: number };
    try {
      result = await paypal.authorizeOrder(orderId);
    } catch (e) {
      if (e instanceof PayPalRefused) throw new SessionError("hold_declined");
      console.error("hold could not be authorized", e instanceof Error ? e.message : e);
      throw new SessionError("paypal_unavailable");
    }
    // From here on PayPal holds the shopper's money: whatever goes wrong, it is written on the visit.
    const hold = { orderId, authorizationId: result.authorizationId, cents: result.amountCents, status: "authorized" as const };
    const money = [...(visit.money ?? []), event(now, "authorized", result.amountCents, result.authorizationId)];
    let held: Visit = { ...visit, hold, money, lastSettledAt: now };
    try {
      if (result.amountCents !== visit.holdOrder.cents) {
        // Not the amount this server asked for: let it go rather than hold the wrong sum.
        await paypal.voidAuthorization(result.authorizationId);
        held = {
          ...held,
          hold: { ...hold, status: "voided" },
          money: [...money, event(now, "voided", result.amountCents, result.authorizationId)],
        };
        await repo.saveVisit(held);
        throw new SessionError("hold_mismatch");
      }
      await repo.saveVisit(held);
    } catch (e) {
      if (e instanceof SessionError) throw e;
      console.error("hold authorized but not recorded", e instanceof Error ? e.message : e);
      await repo.saveVisit(held).catch((again) =>
        console.error("hold could not be saved after PayPal held the money", logRef(id), messageOf(again)),
      );
      throw new SessionError("held_but_unrecorded");
    }
    return { hold: publicHold(held)! };
  });
}

/** A shopper says a pending shelf change is theirs. The first claim wins; its lines join their basket. */
export async function claimPending(deps: SessionDeps, id: string, pendingId: string, now: number) {
  const { repo } = deps;
  const session = await loadSession(repo, id);
  await sweepShop(deps, session.shop, now);
  const fresh = (await repo.getVisit(id)) ?? session;
  if (!isOpenSession(fresh)) throw new SessionError("session_closed");
  const { payMode } = await settingsOf(repo, fresh.shop);
  if (!mayReceive(fresh, payMode)) throw new SessionError("hold_required");
  const pending = await repo.getVisit(pendingId);
  // Another shop's change, or one made before this shopper came in, does not exist for them.
  if (!pending || !pending.pending || pending.shop !== fresh.shop || pending.openedAt < fresh.session!.checkedInAt) {
    throw new SessionError("not_found");
  }
  if (!(await repo.claimVisit(pendingId, id))) throw new SessionError("already_claimed");
  // The claim is won: the lines move. Read again so a shelf change that landed meanwhile is kept.
  const latest = (await repo.getVisit(id)) ?? fresh;
  let merged = addToSession(latest, pending.detected, now, pending.pending.zoneId);
  for (const zoneId of pending.zoneIds ?? []) merged = addToSession(merged, [], now, zoneId);
  merged = {
    ...merged,
    beforeUrl: merged.beforeUrl ?? pending.beforeUrl,
    afterUrl: pending.afterUrl ?? merged.afterUrl,
    confidence: pending.confidence ?? merged.confidence,
  };
  try {
    await repo.saveVisit(merged);
  } catch (e) {
    // The lines did not reach the basket: the change goes back to pending so it can be claimed again.
    await repo
      .saveVisit({ ...pending, status: "open", pending: { ...pending.pending, claimedBy: null } })
      .catch((again) => console.error("claim could not be released", logRef(id), messageOf(again)));
    throw e;
  }
  await repo.saveVisit({ ...pending, status: "empty", closedAt: now, pending: { ...pending.pending, claimedBy: id } });
  const catalogue = await repo.listProducts(merged.shop, { includeArchived: true });
  return { bill: priceLines(merged.paid ?? merged.detected, catalogue) };
}

/** The shopper corrects their basket: the pay page's rules, for an open session that may hold items. */
export async function editSessionLines(deps: SessionDeps, id: string, lines: Line[], now: number) {
  const { repo } = deps;
  const session = await loadSession(repo, id);
  if (!isOpenSession(session)) throw new SessionError("session_closed");
  const { payMode } = await settingsOf(repo, session.shop);
  if (!mayReceive(session, payMode)) throw new SessionError("hold_required");
  try {
    const { visit, bill } = await editLines(repo, id, lines, now, true);
    await repo.saveVisit({ ...visit, lastSettledAt: now });
    return { bill };
  } catch (e) {
    if (e instanceof CheckoutError) throw new SessionError(e.code === "not_found" ? "not_found" : "session_closed");
    throw e;
  }
}

export type DoneResult =
  | { status: "pay"; payLink: string }
  | { status: "paid"; paidCents: number; receipt: PricedBill; payRest: string | null }
  | { status: "closed" };

/**
 * The shopper is finished. Without a hold the pay page takes over. With one, the hold is charged
 * for the basket, never for more than was held; what does not fit moves to a visit of its own to
 * pay on the pay page; an empty basket releases the hold.
 */
export function finishSession(deps: SessionDeps, id: string, now: number): Promise<DoneResult> {
  return once(`done:${id}`, async () => finish(deps, await loadSession(deps.repo, id), now));
}

async function finish(deps: SessionDeps, visit: Visit, now: number): Promise<DoneResult> {
  const { repo } = deps;
  const catalogue = await repo.listProducts(visit.shop, { includeArchived: true });
  const lines = visit.paid ?? visit.detected;
  const bill = priceLines(lines, catalogue);
  const payRest = visit.session?.restId ? `/pay/${visit.session.restId}` : null;

  if (!isOpenSession(visit)) {
    // Asked again after it closed: the same answer, and PayPal is not asked again.
    if (isPaid(visit)) return { status: "paid", paidCents: visit.paidCents ?? 0, receipt: bill, payRest };
    // Closed with nothing to pay: a basket the camera saw empty, or one the shopper cleared.
    const zeroed = visit.status === "empty" || (visit.status === "unmatched" && visit.adjusted === true && bill.totalCents === 0);
    if (visit.hold?.status === "voided" && zeroed) return { status: "paid", paidCents: 0, receipt: bill, payRest };
    if (zeroed) return { status: "closed" };
    if (visit.status === "open" || visit.status === "unmatched") return { status: "pay", payLink: `/pay/${visit.id}` };
    return { status: "closed" };
  }
  // An earlier try was captured but could not be recorded as paid. PayPal is not asked again.
  if (visit.hold?.status === "captured") throw new SessionError("captured_but_unrecorded");

  const closed = { ...visit.session!, closedAt: now };
  if (visit.hold?.status !== "authorized") {
    if (bill.totalCents === 0 && !visit.needsManual) {
      await repo.saveVisit(closeZeroBill({ ...visit, session: closed }, now));
      return { status: "closed" };
    }
    // The pay page has the usual ten minutes from now before the visit counts as unmatched.
    await repo.saveVisit({ ...visit, session: closed, lastSettledAt: now });
    return { status: "pay", payLink: `/pay/${visit.id}` };
  }

  const hold = visit.hold;
  const paypal = deps.paypal();
  // Decided once: an earlier try that did not get through charges what it decided then.
  let closing = hold.closing;
  const split = closing ? null : splitForHold(lines, catalogue, hold.cents);

  if (split && split.keepCents === 0) {
    // Nothing to charge: the hold is released. Anything too dear for it goes to the pay page.
    try {
      await paypal.voidAuthorization(hold.authorizationId);
    } catch (e) {
      console.error("hold could not be released", e instanceof Error ? e.message : e);
      throw new SessionError("paypal_unavailable");
    }
    const released: Visit = {
      ...visit,
      session: closed,
      hold: { ...hold, status: "voided" },
      money: [...(visit.money ?? []), event(now, "voided", hold.cents, hold.authorizationId)],
    };
    if (bill.totalCents === 0) {
      await repo.saveVisit(closeZeroBill(released, now));
      return { status: "paid", paidCents: 0, receipt: bill, payRest: null };
    }
    await repo.saveVisit({ ...released, lastSettledAt: now });
    return { status: "pay", payLink: `/pay/${visit.id}` };
  }

  if (!closing) {
    closing = { cents: split!.keepCents, keep: split!.keep, rest: split!.rest };
    // Saved before PayPal is asked. If it cannot be saved, nothing has moved.
    await repo.saveVisit({ ...visit, hold: { ...hold, closing } });
  }
  // Never more than was held, whatever the bill says.
  const cents = closing.cents;
  if (cents > hold.cents) throw new Error("capture would exceed the hold");
  let result: { captureId: string; amountCents: number };
  try {
    // One final capture per authorization, so the key names the authorization alone.
    result = await paypal.captureAuthorization(hold.authorizationId, cents, `hold-capture-${hold.authorizationId}`, true);
  } catch (e) {
    // Nothing is known to have moved. The session stays open; asking again repeats the same keyed request.
    console.error("hold could not be charged", e instanceof Error ? e.message : e);
    throw new SessionError("paypal_unavailable");
  }

  // From here on PayPal has the money. Whatever goes wrong, the capture is kept on the visit.
  const money = [...(visit.money ?? []), event(now, "captured", result.amountCents, result.captureId)];
  const captured = { ...hold, closing, status: "captured" as const };
  let settled: Visit | null = null;
  try {
    const rest = closing.rest.length > 0 ? restVisit(deps, visit, closing.rest, now) : null;
    const detected = mergeLines(visit.detected, closing.rest.map((l) => ({ sku: l.sku, qty: -l.qty })));
    const base: Visit = {
      ...visit,
      detected,
      session: rest ? { ...closed, restId: rest.id } : closed,
      hold: captured,
      money,
      captureId: result.captureId,
    };
    settled = settlePayment(base, closing.keep, result.amountCents, now);
    await repo.saveVisit(settled);
    if (rest) await repo.saveVisit(rest);
    return {
      status: "paid",
      paidCents: result.amountCents,
      receipt: priceLines(closing.keep, catalogue),
      payRest: rest ? `/pay/${rest.id}` : null,
    };
  } catch (e) {
    console.error("hold charged but not recorded", e instanceof Error ? e.message : e);
    const fallback: Visit = settled ?? {
      ...visit,
      hold: captured,
      money,
      paid: closing.keep,
      paidCents: result.amountCents,
      captureId: result.captureId,
    };
    await repo.saveVisit(fallback).catch((again) =>
      console.error("capture could not be saved after PayPal took the money", logRef(visit.id), messageOf(again)),
    );
    throw new SessionError("captured_but_unrecorded");
  }
}

/** What did not fit under the hold, as an ordinary visit with the same photos, payable on the pay page. */
function restVisit(deps: SessionDeps, from: Visit, rest: Line[], now: number): Visit {
  return {
    ...newVisit((deps.newId ?? newVisitId)(), from.shop, rest, now),
    beforeUrl: from.beforeUrl,
    afterUrl: from.afterUrl,
    ...(from.zoneIds ? { zoneIds: from.zoneIds } : {}),
  };
}

/**
 * Tidies a shop's open visits. A session with money held and no activity for ten minutes is
 * closed the way "done" closes it: the shopper who walks out is charged for what they took.
 * Other stale open visits time out as usual: unclaimed pending changes become unmatched.
 * A failure for one visit is logged and does not stop the rest.
 */
export async function sweepShop(deps: SessionDeps, shop: Shop, now: number): Promise<void> {
  for (const v of await deps.repo.listOpenVisits(shop)) await sweepVisit(deps, v, now);
}

/** One open visit's part of the tidying above. */
export async function sweepVisit(deps: SessionDeps, v: Visit, now: number): Promise<void> {
  if (v.status !== "open" || now - v.lastSettledAt <= SESSION_IDLE_MS) return;
  if (v.session && v.hold?.status === "authorized") {
    await finishSession(deps, v.id, now).catch((e) =>
      console.error("idle session could not be closed", e instanceof Error ? e.message : e),
    );
    return;
  }
  const expired = expireIfStale(v, now);
  if (expired !== v) await deps.repo.saveVisit(expired);
}

export const liveDeps = (repo: Repo): SessionDeps => ({ repo, paypal: getGateway });
