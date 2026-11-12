// Every request the owner's Store page makes, in one place.

import type { PayMode } from "@/lib/basket-view";
import type { Product } from "@/lib/types";

export type Zone = { id: string; name: string; aisle: string; order: number };
export type StoreSettings = { payMode: PayMode; holdOverrideCents: number | null; holdFloorCents: number; holdCapCents: number };
export type ZoneFigures = { zoneId: string | null; takenCents: number; paidCents: number; unmatchedCents: number; visits: number };
export type ZoneDraft = { id?: string; name: string; aisle: string; order: number };

export type StoreData = {
  zones: Zone[];
  settings: StoreSettings;
  suggestedHoldCents: number;
  holdBasis: { visits: number; days: number };
};

/** `code` is "offline" when the server never answered and "unauthorized" when the sign-in ran out. */
export type StoreAnswer<T> = { ok: true; data: T } | { ok: false; code: string; status: number | null };

async function call<T>(path: string, init?: RequestInit): Promise<StoreAnswer<T>> {
  const res = await fetch(path, { cache: "no-store", ...init }).catch(() => null);
  if (!res) return { ok: false, code: "offline", status: null };
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.status === 401) return { ok: false, code: "unauthorized", status: 401 };
  if (!res.ok || body === null) return { ok: false, code: body?.error ?? "server_error", status: res.status };
  return { ok: true, data: body };
}

const put = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const getStore = () => call<StoreData>("/api/owner/store");

export const putZones = (zones: ZoneDraft[]) => call<{ zones: Zone[] }>("/api/owner/store/zones", put({ zones }));

export const putSettings = (settings: StoreSettings) =>
  call<{ settings: StoreSettings; suggestedHoldCents: number }>("/api/owner/store/settings", put(settings));

export const getDoorLink = () => call<{ doorLink: string }>("/api/owner/door-link");

/** Makes a new door QR. Every code printed before stops working. */
export const rotateDoorLink = () =>
  call<{ doorLink: string }>("/api/owner/door-link/rotate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

/** Moves one product to a shelf, or back to "anywhere" with null. The rest of the product is sent as it is. */
export const setProductZone = (product: Product, zoneId: string | null) =>
  call<{ product: Product }>(
    "/api/owner/products",
    put({ sku: product.sku, name: product.name, description: product.description, priceCents: product.priceCents, zoneId }),
  );

/** The shelf a product is on, or null for "anywhere". */
export const zoneOf = (product: Product): string | null => (product as Product & { zoneId?: string | null }).zoneId ?? null;

export const STORE_PROBLEMS: Record<string, string> = {
  demo_read_only: "The demo stand's shelves and pay settings are fixed. Start a trial stand to change them.",
  zone_limit: "This stand has as many shelves as it may have.",
  bad_request: "Some of those details were not accepted. Check them and try again.",
  slow_down: "That was a lot of changes at once. Wait a moment and try again.",
  offline: "The stand couldn't be reached. Check the connection and try again.",
};
export const storeProblem = (code: string) => STORE_PROBLEMS[code] ?? "That didn't work. Nothing was changed.";
