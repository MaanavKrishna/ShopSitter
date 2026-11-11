"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { easeOut, spring, STAGGER } from "@/lib/motion";
import type { Totals, VisitRow } from "@/lib/owner";
import { type LedgerKey, ledgerParts, segmentShares } from "@/lib/owner-view";

// A sliver narrower than this is hard to see on a phone, so small parts are lifted to it.
const MIN_SHARE = 3;

/** One bar showing where the value taken from the shelf went, with the amounts underneath. */
export function ShelfLedger({ totals, visits }: { totals: Totals; visits: VisitRow[] }) {
  const { parts, totalCents } = ledgerParts(totals, visits);
  const shares = segmentShares(parts, MIN_SHARE);
  // The part under the pointer or holding focus: it and its legend line stay lit, the rest dim.
  const [active, setActive] = useState<LedgerKey | null>(null);

  const summary =
    totalCents === 0
      ? "Nothing taken from the shelf in this period."
      : `Of $${formatCents(totalCents)} taken from the shelf: ${parts
          .map((p) => `${p.label.toLowerCase()} $${formatCents(p.cents)}`)
          .join(", ")}.`;

  const drawn = parts.flatMap((p, i) => (shares[i] > 0 ? [{ ...p, share: shares[i] }] : []));
  const activeIndex = drawn.findIndex((p) => p.key === active);
  const activePart = activeIndex >= 0 ? drawn[activeIndex] : null;
  // Middle of the active segment along the bar, kept clear of the ends so the tooltip stays inside.
  const middle = activePart
    ? drawn.slice(0, activeIndex).reduce((sum, p) => sum + p.share, 0) + activePart.share / 2
    : 0;
  const dimmed = (key: LedgerKey) => (active !== null && activePart !== null && active !== key) || undefined;

  const hover = (key: LedgerKey) => ({
    onPointerEnter: () => setActive(key),
    onPointerLeave: () => setActive((now) => (now === key ? null : now)),
  });

  return (
    <div className="ow-ledger">
      <div className="ow-ledger-bar">
        <AnimatePresence>
          {activePart && totalCents > 0 && (
            <motion.div
              key="tip"
              className="ow-tip"
              role="presentation"
              style={{ left: `${Math.min(88, Math.max(12, middle))}%`, x: "-50%" }}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.14, ease: easeOut }}
            >
              <b className="num">${formatCents(activePart.cents)}</b>
              <span>
                {activePart.label} · {Math.round((activePart.cents / totalCents) * 100)}% of what left the shelf
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="ow-ledger-track" role="img" aria-label={summary}>
          <div className="ow-ledger-fill">
            <AnimatePresence initial={false} mode="popLayout">
              {drawn.map((p, i) => (
                <motion.span
                  key={p.key}
                  layout
                  className="ow-ledger-seg"
                  data-dim={dimmed(p.key)}
                  style={{ flexGrow: p.share }}
                  transition={spring}
                  exit={{ opacity: 0 }}
                  {...hover(p.key)}
                >
                  {/* Grows from its left edge, each part after the one before it. */}
                  <motion.span
                    className="ow-ledger-ink"
                    data-part={p.key}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ ...spring, duration: 0.6, delay: 0.15 + i * STAGGER * 1.6 }}
                  />
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <dl className="ow-ledger-legend">
        {parts.map((p) => (
          <div
            key={p.key}
            className="ow-ledger-item"
            data-dim={dimmed(p.key)}
            tabIndex={totalCents > 0 && p.cents > 0 ? 0 : undefined}
            onFocus={() => setActive(p.key)}
            onBlur={() => setActive((now) => (now === p.key ? null : now))}
            {...hover(p.key)}
          >
            <dt>
              <span className="ow-ledger-swatch" data-part={p.key} aria-hidden="true" />
              {p.label}
            </dt>
            <dd className="num">${formatCents(p.cents)}</dd>
          </div>
        ))}
        <div className="ow-ledger-item ow-ledger-total">
          <dt>Taken from the shelf</dt>
          <dd className="num">${formatCents(totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}
