"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import type { BillLine } from "@/lib/types";
import { useOwner } from "./OwnerProvider";
import { photoHref, refundable, RowButton, useRefund, VisitAction, VisitStatus, whenLong } from "./parts";

function Lines({ lines, totalCents, totalLabel }: { lines: BillLine[]; totalCents: number; totalLabel: string }) {
  return (
    <table className="ow-lines">
      <tbody>
        {lines.map((l) => (
          <tr key={l.sku}>
            <th scope="row">
              {l.name}
              <small>
                {l.qty} × ${formatCents(l.unitCents)}
              </small>
            </th>
            <td className="num">${formatCents(l.lineCents)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{totalLabel}</th>
          <td className="num">${formatCents(totalCents)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** One visit in full: when, what the camera saw, what was paid, the shelf photos, and the actions it allows. */
export function VisitDetailView({ id }: { id: string }) {
  const { data, days, changePeriod, switching, hydrated, flash } = useOwner();
  const refund = useRefund();
  const visit = data.visits.find((v) => v.id === id);

  const back = (
    <Link href="/owner/visits" className="ow-back">
      <IconArrowLeft size={16} aria-hidden="true" />
      Visits
    </Link>
  );

  if (!visit) {
    return (
      <div className="ow-detail">
        {back}
        <section className="ow-panel" aria-busy={switching || undefined}>
          <div className="ow-empty ow-empty-tall">
            <b>This visit is not in the period on screen</b>
            <p>
              {days < 30
                ? "It may be older than the period you are looking at. A longer period may hold it."
                : "It is older than 30 days, or it no longer exists."}
            </p>
            {days < 30 && (
              <RowButton tone="strong" busy={switching} onClick={() => changePeriod(30)}>
                Look in the last 30 days
              </RowButton>
            )}
          </div>
        </section>
      </div>
    );
  }

  const time = (ms: number) => (hydrated ? whenLong(ms) : " ");
  // The customer paid for different lines than the camera saw, on time or late: show both.
  // The server prices those lines, so a product removed since still shows on the bill.
  const paidBill = visit.paidBill ?? null;
  const corrected = visit.adjusted === true && paidBill !== null;
  const left = refundable(visit);

  const facts: [string, string][] = [["Opened", time(visit.openedAt)]];
  if (visit.closedAt !== null) facts.push(["Closed", time(visit.closedAt)]);
  if (visit.confidence !== null) facts.push(["Vision model confidence", `${Math.round(visit.confidence * 100)}%`]);
  if (visit.needsManual) facts.push(["Shelf reading", "Could not be read; items were entered by hand"]);
  if (visit.paypalOrderId) facts.push(["PayPal order", visit.paypalOrderId]);
  if (visit.captureId) facts.push(["PayPal capture", visit.captureId]);

  return (
    <div className="ow-detail" data-focus-list>
      {back}
      <header className="ow-detail-head" data-visit-row={visit.id} data-flash={flash === visit.id || undefined}>
        <div>
          <h2 tabIndex={-1} data-focus-heading>
            {time(visit.openedAt)}
          </h2>
          <VisitStatus visit={visit} />
        </div>
        <VisitAction visit={visit} onRefund={refund.open} />
      </header>

      <div className="ow-detail-grid">
        <div className="ow-detail-col">
          <section className="ow-panel" aria-labelledby="seen-h">
            <div className="ow-panel-head">
              <h2 id="seen-h">What the camera saw leave</h2>
            </div>
            {visit.detectedBill.lines.length === 0 ? (
              <div className="ow-empty">
                <b>Nothing detected</b>
                <p>The items on this visit were entered by hand.</p>
              </div>
            ) : (
              <Lines lines={visit.detectedBill.lines} totalCents={visit.detectedCents} totalLabel="Value" />
            )}
          </section>

          <section className="ow-panel" aria-labelledby="paid-h">
            <div className="ow-panel-head">
              <h2 id="paid-h">Payment</h2>
            </div>
            {visit.paidCents === null ? (
              <div className="ow-empty">
                <b>{visit.status === "settled_other" ? "Settled another way" : "No payment through PayPal"}</b>
                <p>
                  {visit.status === "settled_other"
                    ? "You marked this visit as paid outside PayPal."
                    : visit.status === "open"
                      ? "The bill is still open on the stand screen."
                      : "The visit ended and no payment arrived."}
                </p>
              </div>
            ) : (
              <>
                {corrected && paidBill && (
                  <>
                    <p className="ow-detail-note">The customer changed the bill before paying. They paid for:</p>
                    <Lines lines={paidBill.lines} totalCents={paidBill.totalCents} totalLabel="Bill as paid" />
                  </>
                )}
                <dl className="ow-money">
                  <div>
                    <dt>Paid through PayPal</dt>
                    <dd className="num">${formatCents(visit.paidCents)}</dd>
                  </div>
                  {visit.refundedCents > 0 && (
                    <div>
                      <dt>Refunded</dt>
                      <dd className="num">−${formatCents(visit.refundedCents)}</dd>
                    </div>
                  )}
                  {visit.refundedCents > 0 && (
                    <div data-total>
                      <dt>Kept</dt>
                      <dd className="num">${formatCents(left)}</dd>
                    </div>
                  )}
                </dl>
              </>
            )}
          </section>
        </div>

        <div className="ow-detail-col">
          {visit.afterUrl && (
            <section className="ow-panel" aria-labelledby="photos-h">
              <div className="ow-panel-head">
                <h2 id="photos-h">Shelf photos</h2>
              </div>
              <div className="ow-shots">
                {(
                  [
                    ["Before", visit.beforeUrl],
                    ["After", visit.afterUrl],
                  ] as const
                ).map(
                  ([label, url]) =>
                    url && (
                      <a key={label} href={photoHref(url)} target="_blank" rel="noreferrer">
                        {/* Private photos come through the owner's own route, which the image optimiser cannot reach. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoHref(url)} alt={`The shelf ${label.toLowerCase()} this visit`} loading="lazy" />
                        <span>{label}</span>
                      </a>
                    ),
                )}
              </div>
            </section>
          )}

          <section className="ow-panel" aria-labelledby="facts-h">
            <div className="ow-panel-head">
              <h2 id="facts-h">Details</h2>
            </div>
            <dl className="ow-facts">
              {facts.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
      {refund.dialog}
    </div>
  );
}
