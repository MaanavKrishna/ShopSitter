// Every request the shopper's basket makes, in one place. The session id is the shopper's only
// secret: it is sent to this app's own session routes and nowhere else.

import type { PayMode } from "@/lib/basket-view";
import type { BillLine, Line, PricedBill } from "@/lib/types";

export type HoldView = { cents: number; status: string };
export type PendingChange = { id: string; zoneName: string | null; lines: BillLine[]; totalCents: number; at: number };
export type BasketProduct = { sku: string; name: string; priceCents: number };

export type SessionView = {
  status: string;
  payMode: PayMode;
  hold: HoldView | null;
  bill: PricedBill;
  products: BasketProduct[];
  pending: PendingChange[];
  dueCents: number;
  /** The order the PayPal button approves, while the hold is still waiting. */
  holdOrder?: { orderId: string; cents: number };
  paidCents?: number | null;
  /** Where the bill is paid once the basket was finished without a hold. */
  payLink?: string;
  /** Where the part that did not fit the hold is paid. */
  payRest?: string;
};

export type CheckIn = {
  sessionId: string;
  payMode: PayMode;
  holdCents: number | null;
  /** The PayPal order for the hold, when the store asks for one. */
  hold?: { orderId: string; cents: number };
};

export type DoneResult =
  | { status: "paid"; paidCents: number; receipt: PricedBill; payRest: string | null }
  | { status: "pay"; payLink: string }
  | { status: "closed" };

/** `status` is null when the server never answered. */
export type Answer<T> = { ok: true; data: T } | { ok: false; status: number | null; error?: string };

async function call<T>(path: string, init?: RequestInit): Promise<Answer<T>> {
  const res = await fetch(path, { cache: "no-store", ...init }).catch(() => null);
  if (!res) return { ok: false, status: null };
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) return { ok: false, status: res.status, error: body?.error };
  return { ok: true, data: body };
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const path = (sessionId: string, rest = "") => `/api/session/${encodeURIComponent(sessionId)}${rest}`;

/** Fills in anything a session answer left out, so the screen never reads a missing list. */
function whole(view: Partial<SessionView>): SessionView {
  return {
    status: view.status ?? "open",
    payMode: view.payMode ?? "after",
    hold: view.hold ?? null,
    bill: view.bill ?? { lines: [], totalCents: 0 },
    products: view.products ?? [],
    pending: view.pending ?? [],
    dueCents: view.dueCents ?? view.bill?.totalCents ?? 0,
    holdOrder: view.holdOrder,
    paidCents: view.paidCents,
    payLink: view.payLink,
    payRest: view.payRest,
  };
}

/** `hold` answers the store's question when it lets the shopper choose; other stores ignore it. */
export const checkIn = (store: string, hold?: boolean) =>
  call<CheckIn>("/api/session", json("POST", hold === undefined ? { store } : { store, hold }));

/** How the store takes payment, asked before checking in. Nobody is checked in by it. */
export const peekStore = (store: string) =>
  call<{ payMode: PayMode; holdCents: number | null }>("/api/session/peek", json("POST", { store }));

export async function getSession(sessionId: string): Promise<Answer<SessionView>> {
  const answer = await call<Partial<SessionView>>(path(sessionId));
  return answer.ok ? { ok: true, data: whole(answer.data) } : answer;
}

export const claimPending = (sessionId: string, pendingId: string) =>
  call<{ bill?: PricedBill }>(path(sessionId, "/claim"), json("POST", { pendingId }));

export const putLines = (sessionId: string, lines: Line[]) =>
  call<{ bill?: PricedBill }>(path(sessionId, "/lines"), json("PUT", { lines }));

export const confirmHold = (sessionId: string, orderId: string) =>
  call<{ hold: HoldView }>(path(sessionId, "/hold"), json("POST", { orderId }));

export const finish = (sessionId: string) => call<DoneResult>(path(sessionId, "/done"), { method: "POST" });
