"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import { IconArrowRight } from "@tabler/icons-react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PointerEvent } from "react";
import { formatCents } from "@/lib/money";
import { easeOut, spring } from "@/lib/motion";
import { isLow } from "@/lib/owner-view";
import { AskPanel } from "./AskPanel";
import { CountUp } from "./CountUp";
import { useOwner } from "./OwnerProvider";
import { PaidChart } from "./PaidChart";
import { PhotoLinks, takenText, VisitAction, when } from "./parts";
import { ShelfLedger } from "./ShelfLedger";

/** Unmatched visits listed on the overview; the rest are one step away in Visits. */
const FIRST_LOOK = 4;
/** Products listed under "Running low". */
const FIRST_LOW = 4;

const SPOT = 560;
const follow = { stiffness: 170, damping: 26, mass: 0.6 };

/** The overview: what came in, where the shelf's value went, and the few things that want attention. */
export function OverviewView() {
  const router = useRouter();
  const { shop, data, shown, unmatched, days, dataDays, period, loadedAt, switching, refreshing, loading, hydrated, flash, setFilter } =
    useOwner();
  const { totals, visits, stock } = data;
  const visitors = data.visitors ?? 0;
  const bought = visits.filter((v) => v.status.startsWith("paid")).length;
  const low = stock.filter((s) => isLow(s.left));

  // A soft light that follows a mouse across the band. Touch and reduced motion get none (see the stylesheet).
  const x = useSpring(useMotionValue(0), follow);
  const y = useSpring(useMotionValue(0), follow);
  const glow = useSpring(useMotionValue(0), { stiffness: 120, damping: 24 });
  function onMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - box.left - SPOT / 2);
    y.set(e.clientY - box.top - SPOT / 2);
    glow.set(1);
  }

  const time = (ms: number) => (hydrated ? when(ms) : " ");

  return (
    <div className="ow-overview">
      <section
        className="ow-band void"
        aria-label={`${shop === "demo" ? "Demo stand" : "Your stand"}, ${period.subtitle.toLowerCase()}`}
        aria-busy={switching || refreshing || undefined}
        onPointerMove={onMove}
        onPointerLeave={() => glow.set(0)}
      >
        <motion.div className="ow-spot" aria-hidden="true" style={{ x, y, opacity: glow }} />
        <div className="ow-band-body" data-stale={switching || undefined}>
          <div className="ow-paid">
            <p className="ow-paid-label">
              Paid through PayPal <span>· {period.subtitle.toLowerCase()}</span>
            </p>
            <p className="ow-paid-figure num">
              <CountUp cents={totals.paidCents - totals.refundedCents} />
            </p>
            <p className="ow-paid-note">
              {totals.refundedCents > 0
                ? `After $${formatCents(totals.refundedCents)} sent back in refunds`
                : shown.length === 0
                  ? "No visits in this period"
                  : `${bought} paid ${bought === 1 ? "visit" : "visits"} of ${shown.length}`}
            </p>
          </div>
          {/* Days are cut in the viewer's time zone, which the server does not know. */}
          <div className="ow-chart-slot">
            {hydrated && <PaidChart key={dataDays} visits={visits} days={dataDays} now={loadedAt} />}
          </div>
          <ShelfLedger totals={totals} visits={shown} />
        </div>
      </section>

      <AskPanel />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={loading ? "loading" : dataDays}
          className="ow-over-grid"
          data-three={visitors > 0 || undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: easeOut }}
        >
          {loading ? (
            <>
              <section className="ow-panel" aria-busy="true" aria-label="Loading visits">
                <div className="ow-panel-head">
                  <Skeleton width={120} height={20} />
                </div>
                <ListSkeleton rows={4} />
              </section>
              <section className="ow-panel" aria-busy="true" aria-label="Loading the shelf">
                <div className="ow-panel-head">
                  <Skeleton width={100} height={20} />
                </div>
                <ListSkeleton rows={3} />
              </section>
            </>
          ) : (
            <>
              <section className="ow-panel" aria-labelledby="look-h" data-focus-list>
                <div className="ow-panel-head">
                  <h2 id="look-h" tabIndex={-1} data-focus-heading>
                    Needs a look
                  </h2>
                  {unmatched.length > 0 && (
                    <p className="ow-look-total">
                      <span className="num">${formatCents(totals.unmatchedCents)}</span> unmatched
                    </p>
                  )}
                </div>
                {shown.length === 0 ? (
                  <div className="ow-empty">
                    <b>No visits yet</b>
                    <p>They appear here as soon as something leaves the shelf.</p>
                  </div>
                ) : unmatched.length === 0 ? (
                  <div className="ow-empty">
                    <b>Nothing unmatched</b>
                    <p>Everything that left the shelf in this period was paid for or settled.</p>
                  </div>
                ) : (
                  <>
                    <ul className="ow-rows">
                      {/* When one is settled it leaves at once and the rows below slide up into its place. */}
                      {unmatched.slice(0, FIRST_LOOK).map((v) => (
                          <motion.li
                            key={v.id}
                            className="ow-row ow-look-row"
                            data-visit-row={v.id}
                            data-flash={flash === v.id || undefined}
                            layout="position"
                            initial={hydrated ? { opacity: 0 } : false}
                            animate={{ opacity: 1 }}
                            transition={spring}
                            onClick={() => router.push(`/owner/visits/${v.id}`)}
                          >
                            <span className="ow-row-when">{time(v.openedAt)}</span>
                            <span className="ow-row-main">
                              <Link href={`/owner/visits/${v.id}`} onClick={(e) => e.stopPropagation()}>
                                {takenText(v)}
                              </Link>
                              <PhotoLinks visit={v} />
                            </span>
                            <span className="ow-row-money num" data-tone="unmatched">
                              ${formatCents(v.detectedCents)}
                            </span>
                            <span className="ow-row-action">
                              <VisitAction visit={v} onRefund={() => {}} />
                            </span>
                          </motion.li>
                      ))}
                    </ul>
                    <Link
                      href="/owner/visits"
                      className="ow-panel-foot"
                      onClick={() => setFilter("unmatched")}
                    >
                      {unmatched.length > FIRST_LOOK ? `See all ${unmatched.length} in Visits` : "Open in Visits"}
                      <IconArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </>
                )}
              </section>

              <section className="ow-panel" aria-labelledby="low-h">
                <div className="ow-panel-head">
                  <h2 id="low-h">Running low</h2>
                  {low.length > 0 && <p className="ow-panel-meta">{low.length} to restock</p>}
                </div>
                {low.length === 0 ? (
                  <div className="ow-empty">
                    <b>{stock.length === 0 ? "No products yet" : "Shelf is stocked"}</b>
                    <p>{stock.length === 0 ? "Products appear here once the stand has some." : "Nothing is down to its last one."}</p>
                  </div>
                ) : (
                  <ul className="ow-rows">
                    {low.slice(0, FIRST_LOW).map((s) => (
                      <li key={s.sku} className="ow-row ow-low-row">
                        <span className="ow-row-main">{s.name}</span>
                        <span className="ow-restock">Restock</span>
                        <span className="ow-row-money" data-tone="unmatched">
                          <span className="num">{s.left}</span> left
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/owner/shelf" className="ow-panel-foot">
                  {low.length > FIRST_LOW ? `See all ${low.length} on the shelf` : "See the whole shelf"}
                  <IconArrowRight size={15} aria-hidden="true" />
                </Link>
              </section>

              {visitors > 0 && (
                <section className="ow-panel" aria-labelledby="stopped-h">
                  <div className="ow-panel-head">
                    <h2 id="stopped-h">Stopped by</h2>
                  </div>
                  <div className="ow-stopped">
                    <p>
                      <span className="num">{visitors}</span> stopped by
                    </p>
                    <p>
                      <span className="num">{bought}</span> paid
                    </p>
                    <p className="ow-stopped-note">
                      People the stand saw stop at the shelf in {days === 1 ? "the last 24 hours" : `the last ${days} days`}.
                    </p>
                  </div>
                </section>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Placeholder rows the height of real ones. */
export function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="ow-rows-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <Skeleton width={70} height={14} index={i} />
          <Skeleton width={`${46 - (i % 3) * 8}%`} height={14} index={i} />
          <Skeleton width={56} height={14} index={i} />
        </div>
      ))}
    </div>
  );
}
