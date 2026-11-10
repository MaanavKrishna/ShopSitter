"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { formatCents } from "@/lib/money";
import type { StockRow, Totals, VisitRow } from "@/lib/owner";
import { statusLabel } from "@/lib/studio-report";
import type { Product, Shop } from "@/lib/types";
import { Wordmark } from "../Wordmark";

// AG Studio draws on a canvas and measures the window, so it only runs in the browser.
const SalesStudio = dynamic(() => import("./SalesStudio"), {
  ssr: false,
  loading: () => <p className="owner-loading">Loading charts…</p>,
});

type Overview = { visits: VisitRow[]; totals: Totals; stock: StockRow[]; products: Product[] };

const PROBLEMS: Record<string, string> = {
  bad_amount: "That refund is more than what's left of the payment.",
  not_allowed: "That can't be done for this visit.",
  not_found: "That visit no longer exists.",
};

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export function OwnerDashboard({ shop, initial }: { shop: Shop; initial: Overview }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<{ id: string; amount: string } | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/owner/visits?days=7", { cache: "no-store" });
    if (res.status === 401) return router.replace("/owner/login");
    if (res.ok) setData(await res.json());
  }, [router]);

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
        setProblem(PROBLEMS[error] ?? "That didn't work. Nothing was changed.");
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

  const { totals, visits, stock } = data;
  const shown = visits.filter((v) => v.status !== "empty");
  const low = stock.filter((s) => s.left <= 1);

  return (
    <>
    <div className="owner-page">
    <header className="owner-bar void">
      <Wordmark />
      <div className="owner-bar-actions">
        <button type="button" className="btn btn-ghost" onClick={() => void reload()}>
          Refresh
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </header>
    <main className="owner">
      <div className="owner-head">
        <h1>{shop === "demo" ? "Demo stand" : "Your stand"}</h1>
        <p>The last 7 days.</p>
      </div>

      <dl className="owner-tiles">
        <div data-tone="paid">
          <dt>Paid through PayPal</dt>
          <dd className="num">${formatCents(totals.paidCents - totals.refundedCents)}</dd>
        </div>
        <div>
          <dt>Taken from the shelf</dt>
          <dd className="num">${formatCents(totals.soldCents)}</dd>
        </div>
        <div data-tone={totals.unmatchedCents > 0 ? "unmatched" : undefined}>
          <dt>Unmatched</dt>
          <dd className="num">${formatCents(totals.unmatchedCents)}</dd>
        </div>
        <div>
          <dt>Adjusted by customers</dt>
          <dd className="num">${formatCents(totals.adjustedCents)}</dd>
        </div>
      </dl>

      {low.length > 0 && (
        <p className="owner-restock">
          Running low: {low.map((s) => `${s.name} (${s.left} left)`).join(", ")}.
        </p>
      )}

      {problem && (
        <p role="alert" className="pay-notice">
          {problem}
        </p>
      )}

      <section aria-labelledby="visits-h">
        <h2 id="visits-h">Visits</h2>
        {shown.length === 0 ? (
          <p className="owner-empty">No visits yet. They appear here as soon as something leaves the shelf.</p>
        ) : (
          <div className="owner-table-wrap">
            <table className="owner-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Taken</th>
                  <th scope="col">Value</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => {
                  const paid = v.status.startsWith("paid");
                  const refundable = (v.paidCents ?? 0) - v.refundedCents;
                  return (
                    <tr key={v.id}>
                      <td>{when(v.openedAt)}</td>
                      <td>
                        {v.detectedBill.lines.map((l) => `${l.qty} × ${l.name}`).join(", ") || "Entered by hand"}
                        {v.afterUrl && (
                          <>
                            {" "}
                            <a href={photoHref(v.beforeUrl)} target="_blank" rel="noreferrer">
                              before
                            </a>{" "}
                            <a href={photoHref(v.afterUrl)} target="_blank" rel="noreferrer">
                              after
                            </a>
                          </>
                        )}
                      </td>
                      <td className="num">${formatCents(v.detectedCents)}</td>
                      <td className="num">
                        {v.paidCents === null ? "—" : `$${formatCents(v.paidCents)}`}
                        {v.refundedCents > 0 && <small> (−${formatCents(v.refundedCents)} refunded)</small>}
                      </td>
                      <td>
                        <span className="status" data-status={v.status}>
                          {statusLabel(v.status)}
                        </span>
                      </td>
                      <td className="owner-actions">
                        {v.status === "unmatched" && (
                          <button type="button" disabled={busy === v.id} onClick={() => act(v.id, { action: "settle" })}>
                            Settled another way
                          </button>
                        )}
                        {paid &&
                          v.captureId &&
                          refundable > 0 &&
                          (refunding?.id === v.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const cents = Math.round(Number(refunding.amount) * 100);
                                setRefunding(null);
                                void act(v.id, { action: "refund", cents });
                              }}
                            >
                              <label htmlFor={`refund-${v.id}`}>Refund $</label>
                              <input
                                id={`refund-${v.id}`}
                                inputMode="decimal"
                                value={refunding.amount}
                                onChange={(e) => setRefunding({ id: v.id, amount: e.target.value })}
                              />
                              <button type="submit">Send refund</button>
                              <button type="button" onClick={() => setRefunding(null)}>
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              disabled={busy === v.id}
                              onClick={() => setRefunding({ id: v.id, amount: formatCents(refundable) })}
                            >
                              Refund
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SalesStudio visits={visits} stock={stock} />
    </main>
    </div>
    </>
  );
}

/** Stored shelf photos are private and served to the owner; demo samples are public files. */
function photoHref(url: string | null): string {
  if (!url) return "#";
  return url.startsWith("/") ? url : `/api/owner/photos/${encodeURIComponent(url)}`;
}
