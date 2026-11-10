"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { pixel, proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ComponentProps, useCallback, useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import type { StockRow, Totals, VisitRow } from "@/lib/owner";
import { statusLabel } from "@/lib/studio-report";
import type { Product, Shop } from "@/lib/types";
import { Wordmark } from "../Wordmark";
import "@/app/owner/owner.css";

// AG Studio draws on a canvas and measures the window, so it only runs in the browser.
const SalesStudio = dynamic(() => import("./SalesStudio"), {
  ssr: false,
  loading: () => (
    <section className="ow-section" aria-busy="true" aria-label="Sales, loading charts">
      <VStack gap={4}>
        <Skeleton width={120} height={32} />
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

export function OwnerDashboard({ shop, initial }: { shop: Shop; initial: Overview }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<{ id: string; amount: string; invalid: boolean } | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/owner/visits?days=7", { cache: "no-store" });
    if (res.status === 401) return router.replace("/owner/login");
    if (res.ok) setData(await res.json());
  }, [router]);

  async function refresh() {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

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
      await reload();
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

  const { totals, visits, stock } = data;
  const visitors = data.visitors ?? 0;
  const bought = visits.filter((v) => v.status.startsWith("paid")).length;
  const shown = useMemo(() => visits.filter((v) => v.status !== "empty"), [visits]);
  const low = stock.filter((s) => s.left <= 1);
  const refundVisit = refunding ? visits.find((v) => v.id === refunding.id) : undefined;

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

  const paidText = (v: VisitRow) => (v.paidCents === null ? "—" : `$${formatCents(v.paidCents)}`);

  const refundedNote = (v: VisitRow) =>
    v.refundedCents > 0 && (
      <Text type="supporting" display="block">
        −${formatCents(v.refundedCents)} refunded
      </Text>
    );

  const actions = (v: VisitRow) => {
    if (v.status === "unmatched") {
      return (
        <Button
          size="sm"
          label="Settled another way"
          isLoading={busy === v.id}
          onClick={() => void act(v.id, { action: "settle" })}
        />
      );
    }
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
    { key: "openedAt", header: "When", width: pixel(150), renderCell: (v) => when(v.openedAt) },
    {
      key: "taken",
      header: "Taken",
      width: proportional(3, { minWidth: 220 }),
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
      width: pixel(96),
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
      width: pixel(130),
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
    { key: "status", header: "Status", width: pixel(200), renderCell: status },
    {
      key: "actions",
      header: <span className="ow-hidden">Actions</span>,
      width: pixel(250),
      align: "end",
      renderCell: actions,
    },
  ];

  return (
    <div className="ow-page">
      <header className="ow-bar void">
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

      <main className="ow-main">
        <VStack gap={1}>
          <Heading level={1} type="display-3">
            {shop === "demo" ? "Demo stand" : "Your stand"}
          </Heading>
          <Text as="p" type="large" color="secondary">
            The last 7 days.
          </Text>
        </VStack>

        <dl className="ow-tiles">
          <div className="ow-hero">
            <dt>
              <span className="ow-paypal-dot" aria-hidden="true" />
              Paid through PayPal
            </dt>
            <dd className="num">${formatCents(totals.paidCents - totals.refundedCents)}</dd>
          </div>
          <Card padding={5}>
            <Tile label="Taken from the shelf" value={`$${formatCents(totals.soldCents)}`} />
          </Card>
          <Card padding={5}>
            <Tile
              label="Unmatched"
              value={`$${formatCents(totals.unmatchedCents)}`}
              flagged={totals.unmatchedCents > 0}
            />
          </Card>
          <Card padding={5}>
            <Tile label="Adjusted by customers" value={`$${formatCents(totals.adjustedCents)}`} />
          </Card>
          {visitors > 0 && (
            <Card padding={5}>
              <Tile label="Stopped by" value={String(visitors)} note={`${bought} paid`} />
            </Card>
          )}
        </dl>

        {(low.length > 0 || problem) && (
          <VStack gap={3} className="ow-notices">
            {low.length > 0 && (
              <Banner
                status="warning"
                title="Running low"
                description={`${low.map((s) => `${s.name} (${s.left} left)`).join(", ")}.`}
              />
            )}
            {problem && (
              <Banner status="error" title={problem} isDismissable onDismiss={() => setProblem(null)} />
            )}
          </VStack>
        )}

        <section className="ow-section" aria-labelledby="visits-h" aria-busy={refreshing}>
          <HStack gap={3} vAlign="center" className="ow-section-head">
            <Heading level={2} id="visits-h">
              Visits
            </Heading>
            {shown.length > 0 && (
              <Text type="supporting" hasTabularNumbers>
                {shown.length} this week
              </Text>
            )}
            {refreshing && <Spinner size="md" aria-label="Refreshing visits" />}
          </HStack>

          {shown.length === 0 ? (
            <Card padding={6}>
              <EmptyState
                title="No visits yet"
                description="They appear here as soon as something leaves the shelf."
                actions={<Button label="Refresh" isLoading={refreshing} onClick={() => void refresh()} />}
              />
            </Card>
          ) : (
            <>
              <div className="ow-visits-table">
                <Card padding={0}>
                  <Table<VisitRow> data={shown} columns={columns} idKey="id" density="spacious" hasHover />
                </Card>
              </div>

              <ul className="ow-visits-cards">
                {shown.map((v) => {
                  const action = actions(v);
                  return (
                    <li key={v.id}>
                      <Card padding={4}>
                        <VStack gap={3}>
                          <HStack gap={2} hAlign="between" vAlign="center">
                            <Text type="supporting">{when(v.openedAt)}</Text>
                            {status(v)}
                          </HStack>
                          <VStack gap={1}>
                            <Text weight="medium">{takenText(v)}</Text>
                            {photos(v)}
                          </VStack>
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
                        </VStack>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <SalesStudio visits={visits} stock={stock} />
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

function Tile({ label, value, note, flagged }: { label: string; value: string; note?: string; flagged?: boolean }) {
  return (
    <>
      <dt className="ow-tile-label" data-flagged={flagged || undefined}>
        {label}
      </dt>
      <dd className="ow-tile-value num" data-flagged={flagged || undefined}>
        {value}
      </dd>
      {note && <dd className="ow-tile-note">{note}</dd>}
    </>
  );
}

/** Stored shelf photos are private and served to the owner; demo samples are public files. */
function photoHref(url: string | null): string {
  if (!url) return "#";
  return url.startsWith("/") ? url : `/api/owner/photos/${encodeURIComponent(url)}`;
}
