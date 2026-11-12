"use client";

import { useAnnounce } from "@astryxdesign/core/hooks";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { StockRow, Totals, VisitRow } from "@/lib/owner";
import type { VisitFilter } from "@/lib/owner-view";
import { type ShopKind, shopKind } from "@/lib/shops";
import { trialOver } from "@/lib/trial-view";
import type { Product, Shop } from "@/lib/types";
import type { Zone, ZoneFigures } from "./storeApi";

export type Overview = {
  visits: VisitRow[];
  totals: Totals;
  stock: StockRow[];
  products: Product[];
  visitors?: number;
  shopKind?: ShopKind;
  /** The stand's shelves, when it has any. */
  zones?: Zone[];
  /** What was taken, paid and left unmatched on each shelf in the period; null gathers products kept anywhere. */
  byZone?: ZoneFigures[];
};

/** How a trial stand's devices are let in: the key, and the link that carries it to the stand screen. */
export type TrialStand = { key: string; expiresAt: number; standLink: string };

export const PERIODS = [
  { days: 1, label: "24 hours", short: "24h", subtitle: "The last 24 hours", span: "24 hours" },
  { days: 7, label: "7 days", short: "7d", subtitle: "The last 7 days", span: "7 days" },
  { days: 30, label: "30 days", short: "30d", subtitle: "The last 30 days", span: "30 days" },
] as const;

export type Period = (typeof PERIODS)[number];

const PROBLEMS: Record<string, string> = {
  bad_amount: "That refund is more than what's left of the payment.",
  demo_read_only: "The demo stand can't send refunds. Start a trial stand to try it.",
  hold_open: "The shopper's PayPal hold couldn't be released, so nothing was changed. Try again.",
  not_allowed: "That can't be done for this visit.",
  not_found: "That visit no longer exists.",
  paypal_refused: "PayPal didn't accept the refund. Nothing was sent.",
};

const REFUND_UNCONFIRMED = "We couldn't confirm the refund. Check PayPal before trying again.";

/** A reload faster than this keeps the old rows on screen instead of flashing placeholders. */
const SKELETON_AFTER_MS = 180;
/** How long a row stays marked after its visit was changed. */
const FLASH_MS = 1600;

type OwnerState = {
  shop: Shop;
  /** Whether this is the owner's own stand, the shared demo, or a visitor's trial. */
  kind: ShopKind;
  /** A trial's key and stand link, once they have loaded. Always null for the other kinds. */
  trialStand: TrialStand | null;
  /** The trial has run out or was ended: nothing here can be used any more. */
  ended: boolean;
  /** Marks the trial as over, after it was ended from this page or its time ran out. */
  markEnded: () => void;
  /** Fetches the figures again without any sign of loading, for a page that is waiting on the stand. */
  reloadQuietly: () => Promise<void>;
  data: Overview;
  /** Visits where something left the shelf. */
  shown: VisitRow[];
  unmatched: VisitRow[];
  /** The period the owner picked. */
  days: number;
  period: Period;
  /** The period the figures on screen belong to; trails `days` while a switch is loading. */
  dataDays: number;
  loadedAt: number;
  changePeriod: (days: number) => void;
  refresh: () => void;
  refreshing: boolean;
  switching: boolean;
  /** A period switch has taken long enough to show placeholders. */
  loading: boolean;
  act: (id: string, body: object) => Promise<void>;
  /** Id of the visit an action is running for. */
  busy: string | null;
  /** Id of the visit that was just changed, for a brief highlight. */
  flash: string | null;
  problem: string | null;
  clearProblem: () => void;
  filter: VisitFilter;
  setFilter: (filter: VisitFilter) => void;
  /** False while server markup is adopted: gates anything that depends on the viewer's time zone. */
  hydrated: boolean;
  signOut: () => void;
};

const OwnerContext = createContext<OwnerState | null>(null);

export function useOwner(): OwnerState {
  const state = useContext(OwnerContext);
  if (!state) throw new Error("useOwner needs OwnerProvider above it");
  return state;
}

const noSubscription = () => () => {};

// Leaves through a full page load on purpose, so nothing fetched for this stand stays in memory.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
const leave = () => window.location.assign("/owner/login");

const SIGNED_OUT = "shopsitter-owner-signed-out";

/**
 * For owner requests made outside this provider: call it when the server answers 401. The owner
 * of a real stand is sent to sign in; a trial stand shows that it has ended.
 */
export const ownerSignedOut = () => window.dispatchEvent(new Event(SIGNED_OUT));

/** Holds the stand's figures, the chosen period and every owner action for all sections of the owner area. */
export function OwnerProvider({ shop, initial, children }: { shop: Shop; initial: Overview; children: ReactNode }) {
  const announce = useAnnounce();
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const kind = initial.shopKind ?? shopKind(shop);
  const [ended, setEnded] = useState(false);
  const [trialStand, setTrialStand] = useState<TrialStand | null>(null);
  const markEnded = useCallback(() => setEnded(true), []);
  // A trial that is over has no sign-in page to go back to: the shell says so in place.
  const signedOut = useCallback(() => (kind === "trial" ? setEnded(true) : leave()), [kind]);

  useEffect(() => {
    window.addEventListener(SIGNED_OUT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT, signedOut);
  }, [signedOut]);

  useEffect(() => {
    if (kind !== "trial") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch("/api/owner/stand-link", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 401) return setEnded(true);
        const body = (await res.json().catch(() => null)) as (Partial<TrialStand> & { mode?: string }) | null;
        if (!res.ok || body?.mode !== "key" || !body.key || !body.standLink || !body.expiresAt) return;
        setTrialStand({ key: body.key, expiresAt: body.expiresAt, standLink: body.standLink });
        // The page turns over by itself at the moment the trial runs out, even if nobody touches it.
        const wait = body.expiresAt - Date.now();
        if (trialOver(body.expiresAt, Date.now())) setEnded(true);
        else if (wait < 2 ** 31) timer = setTimeout(() => live && setEnded(true), wait);
      })
      .catch(() => {});
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind]);

  const [data, setData] = useState(initial);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [days, setDays] = useState(7);
  const [dataDays, setDataDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [slow, setSlow] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<VisitFilter>("all");
  // Only the newest request may update the page, so a slow answer for an old period cannot overwrite a newer one.
  const latest = useRef(0);
  const daysNow = useRef(7);

  const reload = useCallback(async (forDays: number) => {
    const request = ++latest.current;
    const res = await fetch(`/api/owner/visits?days=${forDays}`, { cache: "no-store" });
    if (res.status === 401) return signedOut();
    if (!res.ok || request !== latest.current) return;
    setData(await res.json());
    setDataDays(forDays);
    setLoadedAt(Date.now());
  }, [signedOut]);

  const reloadQuietly = useCallback(() => reload(daysNow.current).catch(() => {}), [reload]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void reload(daysNow.current).finally(() => setRefreshing(false));
  }, [reload]);

  const changePeriod = useCallback(
    (next: number) => {
      if (next === daysNow.current) return;
      daysNow.current = next;
      setDays(next);
      setSwitching(true);
      const mine = latest.current + 1;
      void reload(next).finally(() => {
        // A newer switch is still loading; it clears the flag when it lands.
        if (latest.current === mine) setSwitching(false);
      });
    },
    [reload],
  );

  useEffect(() => {
    if (!switching) return;
    const timer = setTimeout(() => setSlow(true), SKELETON_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [switching]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const act = useCallback(
    async (id: string, body: object) => {
      setBusy(id);
      setProblem(null);
      const refund = (body as { action?: string }).action === "refund";
      try {
        const res = await fetch(`/api/owner/visits/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const { error } = (await res.json().catch(() => ({}))) as { error?: string };
          // A refund that failed on the server side may or may not have reached PayPal.
          const text =
            (error && PROBLEMS[error]) ||
            (refund && res.status >= 500 ? REFUND_UNCONFIRMED : "That didn't work. Nothing was changed.");
          setProblem(text);
          announce(text, "assertive");
        }
        await reload(daysNow.current);
        if (res.ok) setFlash(id);
      } catch {
        // No answer at all: it is not known whether the change landed, so the page says only that.
        const text = refund
          ? REFUND_UNCONFIRMED
          : "The stand couldn't be reached. Check the connection, then refresh to see what was saved.";
        setProblem(text);
        announce(text, "assertive");
      } finally {
        setBusy(null);
      }
    },
    [announce, reload],
  );

  const signOut = useCallback(() => {
    void fetch("/api/owner/login", { method: "DELETE" }).finally(leave);
  }, []);

  const clearProblem = useCallback(() => setProblem(null), []);

  const shown = useMemo(() => data.visits.filter((v) => v.status !== "empty"), [data.visits]);
  const unmatched = useMemo(() => shown.filter((v) => v.status === "unmatched"), [shown]);

  const value: OwnerState = {
    shop,
    kind,
    trialStand,
    ended,
    markEnded,
    reloadQuietly,
    data,
    shown,
    unmatched,
    days,
    period: PERIODS.find((p) => p.days === days) ?? PERIODS[1],
    dataDays,
    loadedAt,
    changePeriod,
    refresh,
    refreshing,
    switching,
    loading: switching && slow,
    act,
    busy,
    flash,
    problem,
    clearProblem,
    filter,
    setFilter,
    hydrated,
    signOut,
  };

  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}
