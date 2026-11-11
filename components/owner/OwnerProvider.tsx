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
import type { Product, Shop } from "@/lib/types";

export type Overview = { visits: VisitRow[]; totals: Totals; stock: StockRow[]; products: Product[]; visitors?: number };

export const PERIODS = [
  { days: 1, label: "Today", short: "Today", subtitle: "The last 24 hours", span: "24 hours" },
  { days: 7, label: "7 days", short: "7d", subtitle: "The last 7 days", span: "7 days" },
  { days: 30, label: "30 days", short: "30d", subtitle: "The last 30 days", span: "30 days" },
] as const;

export type Period = (typeof PERIODS)[number];

const PROBLEMS: Record<string, string> = {
  bad_amount: "That refund is more than what's left of the payment.",
  not_allowed: "That can't be done for this visit.",
  not_found: "That visit no longer exists.",
};

/** A reload faster than this keeps the old rows on screen instead of flashing placeholders. */
const SKELETON_AFTER_MS = 180;
/** How long a row stays marked after its visit was changed. */
const FLASH_MS = 1600;

type OwnerState = {
  shop: Shop;
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

/** Holds the stand's figures, the chosen period and every owner action for all sections of the owner area. */
export function OwnerProvider({ shop, initial, children }: { shop: Shop; initial: Overview; children: ReactNode }) {
  const announce = useAnnounce();
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
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
    if (res.status === 401) return leave();
    if (!res.ok || request !== latest.current) return;
    setData(await res.json());
    setDataDays(forDays);
    setLoadedAt(Date.now());
  }, []);

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
      try {
        const res = await fetch(`/api/owner/visits/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const { error } = await res.json();
          const text = PROBLEMS[error] ?? "That didn't work. Nothing was changed.";
          setProblem(text);
          announce(text, "assertive");
        }
        await reload(daysNow.current);
        if (res.ok) setFlash(id);
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
