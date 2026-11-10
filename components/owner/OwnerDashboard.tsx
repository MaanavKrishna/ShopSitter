"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { pixel, proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatCents } from "@/lib/money";
import type { StockRow, Totals, VisitRow } from "@/lib/owner";
import { countByFilter, isLow, matchesFilter, type VisitFilter } from "@/lib/owner-view";
import { statusLabel } from "@/lib/studio-report";
import type { Product, Shop } from "@/lib/types";
import { Wordmark } from "../Wordmark";
import { PaidChart } from "./PaidChart";
import { ShelfLedger } from "./ShelfLedger";
import "@/app/owner/owner.css";

// AG Studio draws on a canvas and measures the window, so it only runs in the browser.
const SalesStudio = dynamic(() => import("./SalesStudio"), {
  ssr: false,
  loading: () => (
    <section className="ow-explore" aria-busy="true" aria-label="Explore sales, loading charts">
      <VStack gap={4}>
        <Skeleton width={180} height={32} />
        <Skeleton height={420} radius={4} />
      </VStack>
    </section>
  ),
});

type Overview = { visits: VisitRow[]; totals: Totals; stock: StockRow[]; products: Product[]; visitors?: number };

const PROBLEMS: Record<string, string> = {
  bad_amount: "That refund is more than what's left of the payment.",
  not_allowed: "That can't be done for this visit.",
  not_found: "That visit no longer exists.",
};

const PERIODS = [
  { days: 1, label: "Today", subtitle: "The last 24 hours" },
  { days: 7, label: "7 days", subtitle: "The last 7 days" },
  { days: 30, label: "30 days", subtitle: "The last 30 days" },
];

const FILTERS: { value: VisitFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unmatched", label: "Unmatched" },
  { value: "open", label: "Open" },
];

/** Rows shown before the owner asks for the rest. */
const FIRST_ROWS = 8;
/** A reload faster than this keeps the old figures on screen instead of flashing placeholders. */
const SKELETON_AFTER_MS = 180;

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

// Paid visits read as the brand blue; only the ones worth a second look get a warmer colour.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  paid: "blue",
  paid_late: "blue",
  paid_adjusted: "yellow",
  unmatched: "orange",
};

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

const takenText = (v: VisitRow) =>
  v.detectedBill.lines.map((l) => `${l.qty} × ${l.name}`).join(", ") || "Entered by hand";

const refundable = (v: VisitRow) => (v.paidCents ?? 0) - v.refundedCents;

const paidText = (v: VisitRow) => (v.paidCents === null ? "—" : `$${formatCents(v.paidCents)}`);

// False while the server markup is being adopted, true afterwards: gates anything that depends on the viewer's time zone.
const noSubscription = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

/** Unmatched visits listed before "Show all". */
const FIRST_LOOK = 4;

export function OwnerDashboard({ shop, initial }: { shop: Shop; initial: Overview }) {
  const router = useRouter();
  const announce = useAnnounce();
  const hydrated = useHydrated();
  const [data, setData] = useState(initial);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [slow, setSlow] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<VisitFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [lookAll, setLookAll] = useState(false);
  const [refunding, setRefunding] = useState<{ id: string; amount: string; invalid: boolean } | null>(null);
  // Only the newest request may update the page, so a slow answer for an old period cannot overwrite a newer one.
  const latest = useRef(0);

  const reload = useCallback(
    async (forDays: number) => {
      const request = ++latest.current;
      const res = await fetch(`/api/owner/visits?days=${forDays}`, { cache: "no-store" });
      if (res.status === 401) return router.replace("/owner/login");
      if (!res.ok || request !== latest.current) return;
      setData(await res.json());
      setLoadedAt(Date.now());
    },
    [router],
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await reload(days);
    } finally {
      setRefreshing(false);
    }
  }

  async function changePeriod(value: string) {
    const next = Number(value);
    if (next === days) return;
    setDays(next);
    setShowAll(false);
    setSwitching(true);
    const mine = latest.current + 1;
    try {
      await reload(next);
    } finally {
      // A newer switch is still loading; it clears the flag when it lands.
      if (latest.current === mine) setSwitching(false);
    }
  }

  useEffect(() => {
    if (!switching) return;
    const timer = setTimeout(() => setSlow(true), SKELETON_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [switching]);

  async function act(id: string, body: object) {
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
      await reload(days);
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await fetch("/api/owner/login", { method: "DELETE" });
    router.replace("/owner/login");
  }

  function sendRefund() {
    if (!refunding) return;
    const cents = Math.round(Number(refunding.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setRefunding({ ...refunding, invalid: true });
    setRefunding(null);
    void act(refunding.id, { action: "refund", cents });
  }

  const { totals, visits, stock, products } = data;
  const period = PERIODS.find((p) => p.days === days) ?? PERIODS[1];
  const loading = switching && slow;
  const visitors = data.visitors ?? 0;
  const bought = visits.filter((v) => v.status.startsWith("paid")).length;
  const shown = useMemo(() => visits.filter((v) => v.status !== "empty"), [visits]);
  const counts = useMemo(() => countByFilter(shown), [shown]);
  const unmatched = useMemo(() => shown.filter((v) => v.status === "unmatched"), [shown]);
  const filtered = useMemo(() => shown.filter((v) => matchesFilter(v, filter)), [shown, filter]);
  const listed = showAll ? filtered : filtered.slice(0, FIRST_ROWS);
  const refundVisit = refunding ? visits.find((v) => v.id === refunding.id) : undefined;

  // Lowest first, so what needs restocking is at the top.
  const shelf = useMemo(() => {
    const starting = new Map(products.map((p) => [p.sku, p.stock]));
    return stock
      .map((s) => ({ ...s, starting: Math.max(starting.get(s.sku) ?? 0, s.left), low: isLow(s.left) }))
      .sort((a, b) => Number(b.low) - Number(a.low));
  }, [stock, products]);

  // Times are written in the viewer's own zone and format, which only the browser knows.
  const time = (ms: number) => (hydrated ? when(ms) : "\u00a0");

  const status = (v: VisitRow) => (
    <Badge variant={STATUS_VARIANT[v.status] ?? "neutral"} label={statusLabel(v.status)} />
  );

  const photos = (v: VisitRow) =>
    v.afterUrl && (
      <HStack gap={3}>
        <Link href={photoHref(v.beforeUrl)} target="_blank" rel="noreferrer" size="sm">
          Before
        </Link>
        <Link href={photoHref(v.afterUrl)} target="_blank" rel="noreferrer" size="sm">
          After
        </Link>
      </HStack>
    );

  const refundedNote = (v: VisitRow) =>
    v.refundedCents > 0 && (
      <Text type="supporting" display="block">
        −${formatCents(v.refundedCents)} refunded
      </Text>
    );

  const settleButton = (v: VisitRow) => (
    <Button
      size="sm"
      label="Settled another way"
      isLoading={busy === v.id}
      onClick={() => void act(v.id, { action: "settle" })}
    />
  );

  const actions = (v: VisitRow) => {
    // Unmatched visits are settled from the "Needs a look" list above, so the table does not repeat the button.
    if (v.status === "unmatched") return null;
    if (v.status.startsWith("paid") && v.captureId && refundable(v) > 0) {
      return (
        <Button
          size="sm"
          label="Refund"
          isLoading={busy === v.id}
          onClick={() => setRefunding({ id: v.id, amount: formatCents(refundable(v)), invalid: false })}
        />
      );
    }
    return null;
  };

  const columns: TableColumn<VisitRow>[] = [
    {
      key: "openedAt",
      header: "When",
      width: pixel(118),
      renderCell: (v) => time(v.openedAt),
    },
    {
      key: "taken",
      header: "Taken",
      width: proportional(3, { minWidth: 180 }),
      renderCell: (v) => (
        <VStack gap={1}>
          <Text>{takenText(v)}</Text>
          {photos(v)}
        </VStack>
      ),
    },
    {
      key: "detectedCents",
      header: "Value",
      width: pixel(98),
      align: "end",
      renderCell: (v) => (
        <Text hasTabularNumbers weight="semibold">
          ${formatCents(v.detectedCents)}
        </Text>
      ),
    },
    {
      key: "paidCents",
      header: "Paid",
      width: pixel(98),
      align: "end",
      renderCell: (v) => (
        <>
          <Text hasTabularNumbers weight="semibold" color={v.paidCents === null ? "secondary" : "primary"}>
            {paidText(v)}
          </Text>
          {refundedNote(v)}
        </>
      ),
    },
    { key: "status", header: "Status", width: pixel(140), renderCell: status },
    {
      key: "actions",
      header: <span className="ow-hidden">Actions</span>,
      width: pixel(228),
      align: "end",
      renderCell: actions,
    },
  ];

  return (
    <div className="ow-page">
      <div className="ow-band void">
        <header className="ow-bar">
          <Wordmark />
          <div className="ow-bar-actions">
            <button
              type="button"
              className="btn btn-ghost ow-bar-btn"
              aria-busy={refreshing}
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing && <Spinner size="sm" shade="inherit" aria-label="Refreshing" />}
              Refresh
            </button>
            <button type="button" className="btn btn-ghost ow-bar-btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <div className="ow-band-in">
          <div className="ow-band-head">
            <div>
              <h1>{shop === "demo" ? "Demo stand" : "Your stand"}</h1>
              <p className="ow-band-sub">{period.subtitle}</p>
            </div>
            <div className="ow-period">
              <SegmentedControl
                label="Period"
                layout="fill"
                value={String(days)}
                onChange={(value) => void changePeriod(value)}
              >
                {PERIODS.map((p) => (
                  <SegmentedControlItem key={p.days} value={String(p.days)} label={p.label} />
                ))}
              </SegmentedControl>
            </div>
          </div>

          {loading ? (
            <div className="ow-band-body" aria-busy="true" aria-label="Loading this period">
              <div className="ow-paid">
                <Skeleton width={170} height={22} />
                <Skeleton width="min(100%, 21rem)" height={88} radius={3} />
              </div>
              <div className="ow-chart-slot">
                <Skeleton height={150} radius={3} />
              </div>
              <div className="ow-ledger">
                <Skeleton height={28} radius={3} />
                <Skeleton width="min(100%, 34rem)" height={40} radius={3} />
              </div>
            </div>
          ) : (
            <div className="ow-band-body" aria-busy={switching || refreshing}>
              <div className="ow-paid">
                <p className="ow-paid-label">Paid through PayPal</p>
                <p className="ow-paid-figure num">${formatCents(totals.paidCents - totals.refundedCents)}</p>
                {totals.refundedCents > 0 && (
                  <p className="ow-paid-note">After ${formatCents(totals.refundedCents)} sent back in refunds</p>
                )}
              </div>
              {/* Days are cut in the viewer's time zone, which the server does not know. */}
              <div className="ow-chart-slot">{hydrated && <PaidChart visits={visits} days={days} now={loadedAt} />}</div>
              <ShelfLedger totals={totals} visits={shown} />
            </div>
          )}
        </div>
      </div>

      <main className="ow-main">
        {problem && (
          <div className="ow-notice">
            <Banner status="error" title={problem} isDismissable onDismiss={() => setProblem(null)} />
          </div>
        )}

        <div className="ow-cols">
          <div className="ow-col">
            {loading ? (
              <section className="ow-panel ow-pad" aria-busy="true" aria-label="Loading visits">
                <VStack gap={4}>
                  <Skeleton width={140} height={30} />
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={44} radius={2} index={i} />
                  ))}
                </VStack>
              </section>
            ) : shown.length === 0 ? (
              <section className="ow-panel ow-pad" aria-label="Visits">
                <EmptyState
                  title="No visits yet"
                  description="They appear here as soon as something leaves the shelf."
                  actions={<Button label="Refresh" isLoading={refreshing} onClick={() => void refresh()} />}
                />
              </section>
            ) : (
              <>
                {unmatched.length === 0 ? (
                  <p className="ow-all-clear">Nothing unmatched in this period.</p>
                ) : (
                  <section className="ow-panel" aria-labelledby="look-h">
                    <div className="ow-panel-head">
                      <h2 id="look-h">Needs a look</h2>
                      <p className="ow-look-total">
                        <span className="num">${formatCents(totals.unmatchedCents)}</span> unmatched
                      </p>
                    </div>
                    <>
                      <p className="ow-look-hint">
                        These left the shelf and no payment arrived. If you were paid another way, mark it settled.
                      </p>
                      <ul className="ow-look">
                        {(lookAll ? unmatched : unmatched.slice(0, FIRST_LOOK)).map((v) => (
                          <li key={v.id}>
                            <span className="ow-look-when">{time(v.openedAt)}</span>
                            <span className="ow-look-taken">
                              {takenText(v)}
                              {photos(v)}
                            </span>
                            <span className="ow-look-value num">${formatCents(v.detectedCents)}</span>
                            <span className="ow-look-action">{settleButton(v)}</span>
                          </li>
                        ))}
                      </ul>
                      {unmatched.length > FIRST_LOOK && (
                        <div className="ow-more">
                          <Button
                            variant="ghost"
                            label={lookAll ? `Show the first ${FIRST_LOOK}` : `Show all ${unmatched.length}`}
                            onClick={() => setLookAll(!lookAll)}
                          />
                        </div>
                      )}
                    </>
                  </section>
                )}

                <section className="ow-panel" aria-labelledby="visits-h" aria-busy={refreshing}>
                  <div className="ow-panel-head">
                    <h2 id="visits-h">Visits</h2>
                    <div className="ow-filter">
                      <SegmentedControl
                        label="Show visits"
                        layout="fill"
                        value={filter}
                        onChange={(value) => {
                          setFilter(value as VisitFilter);
                          setShowAll(false);
                        }}
                      >
                        {FILTERS.map((f) => (
                          <SegmentedControlItem key={f.value} value={f.value} label={`${f.label} ${counts[f.value]}`} />
                        ))}
                      </SegmentedControl>
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <p className="ow-calm">No {filter} visits in this period.</p>
                  ) : (
                    <>
                      <div className="ow-visits-table">
                        <Table<VisitRow> data={listed} columns={columns} idKey="id" density="balanced" hasHover />
                      </div>

                      <ul className="ow-visits-cards">
                        {listed.map((v) => {
                          const action = actions(v);
                          return (
                            <li key={v.id}>
                              <div className="ow-visit-top">
                                <span>{time(v.openedAt)}</span>
                                {status(v)}
                              </div>
                              <div className="ow-visit-taken">
                                {takenText(v)}
                                {photos(v)}
                              </div>
                              <dl className="ow-visit-money">
                                <div>
                                  <dt>Value</dt>
                                  <dd className="num">${formatCents(v.detectedCents)}</dd>
                                </div>
                                <div>
                                  <dt>Paid</dt>
                                  <dd className="num" data-none={v.paidCents === null || undefined}>
                                    {paidText(v)}
                                  </dd>
                                  {v.refundedCents > 0 && (
                                    <dd className="ow-visit-note">−${formatCents(v.refundedCents)} refunded</dd>
                                  )}
                                </div>
                              </dl>
                              {action && <div className="ow-visit-action">{action}</div>}
                            </li>
                          );
                        })}
                      </ul>

                      {filtered.length > FIRST_ROWS && (
                        <div className="ow-more">
                          <Button
                            variant="ghost"
                            label={showAll ? `Show the first ${FIRST_ROWS}` : `Show all ${filtered.length}`}
                            onClick={() => setShowAll(!showAll)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </section>
              </>
            )}
          </div>

          <aside className="ow-rail" aria-label="Shelf and visitors">
            {loading ? (
              <section className="ow-panel ow-pad" aria-busy="true" aria-label="Loading the shelf">
                <VStack gap={4}>
                  <Skeleton width={150} height={30} />
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} height={34} radius={2} index={i} />
                  ))}
                </VStack>
              </section>
            ) : (
              <>
                <section className="ow-panel ow-pad" aria-labelledby="shelf-h">
                  <h2 id="shelf-h">On the shelf</h2>
                  {shelf.length === 0 ? (
                    <p className="ow-calm ow-calm-flush">No products yet.</p>
                  ) : (
                    <ul className="ow-shelf">
                      {shelf.map((s) => (
                        <li key={s.sku} data-low={s.low || undefined}>
                          <span className="ow-shelf-name">{s.name}</span>
                          <span className="ow-shelf-left">
                            {s.low && <b>Restock</b>}
                            <span className="num">{s.left}</span> of {s.starting}
                          </span>
                          <span className="ow-shelf-level" aria-hidden="true">
                            <span style={{ width: `${s.starting > 0 ? (s.left / s.starting) * 100 : 0}%` }} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {visitors > 0 && (
                  <section className="ow-panel ow-pad" aria-labelledby="stopped-h">
                    <h2 id="stopped-h">Stopped by</h2>
                    <p className="ow-stopped">
                      <span className="num">{visitors}</span> stopped by, <span className="num">{bought}</span> paid
                    </p>
                    <p className="ow-stopped-note">People the stand saw stop at the shelf in this period.</p>
                  </section>
                )}
              </>
            )}
          </aside>
        </div>

        {!loading && shown.length > 0 && <SalesStudio visits={visits} stock={stock} />}
      </main>

      <Dialog isOpen={refunding !== null} onOpenChange={(open) => !open && setRefunding(null)} purpose="form" width={420}>
        <DialogHeader
          title="Send a refund"
          subtitle={refundVisit ? `${when(refundVisit.openedAt)} · ${takenText(refundVisit)}` : undefined}
          onOpenChange={() => setRefunding(null)}
        />
        <form
          className="ow-dialog-body"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            sendRefund();
          }}
        >
          <VStack gap={5}>
            <TextInput
              label="Refund amount in dollars"
              description={
                refundVisit ? `Up to $${formatCents(refundable(refundVisit))} can go back through PayPal.` : undefined
              }
              inputMode="decimal"
              size="lg"
              width="100%"
              hasAutoFocus
              value={refunding?.amount ?? ""}
              onChange={(amount) => refunding && setRefunding({ ...refunding, amount, invalid: false })}
              statusVariant="detached"
              status={refunding?.invalid ? { type: "error", message: "Enter an amount, like 4.50." } : undefined}
            />
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" variant="ghost" onClick={() => setRefunding(null)} />
              <Button type="submit" variant="primary" label="Send refund" />
            </HStack>
          </VStack>
        </form>
      </Dialog>
    </div>
  );
}

/** Stored shelf photos are private and served to the owner; demo samples are public files. */
function photoHref(url: string | null): string {
  if (!url) return "#";
  return url.startsWith("/") ? url : `/api/owner/photos/${encodeURIComponent(url)}`;
}
