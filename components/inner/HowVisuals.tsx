"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { GRID_COLS, GRID_ROWS } from "@/lib/frame-diff";
import { easeOut, spring, springBouncy, springSnappy } from "@/lib/motion";
import { Cutout, DrawnCode, type Item, StatusBadge, type Tone, usd } from "./bits";
import { Rolling, Stepper } from "./Stepper";
import { usePhase } from "./usePhase";

const SHELF = ["jam", "honey", "eggs", "bread", "apples", "flowers"];
/** The item the walk-through follows off the shelf. */
const TAKEN = "honey";
const JOINED = "jam";

const price = (items: Item[], sku: string) => items.find((i) => i.sku === sku)?.priceCents ?? 0;
const nameOf = (items: Item[], sku: string) => items.find((i) => i.sku === sku)?.name ?? sku;

function Frame({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={`in-vis ${className}`} aria-label={label}>
      {children}
    </figure>
  );
}

/* 1. A shelf, and one jar leaving it. */
const SHELF_HOLDS = [1800, 1500, 2400] as const;

export function ShelfVis() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, SHELF_HOLDS);
  const gone = phase > 0;
  return (
    <Frame label="A shelf of six products. A jar of honey is lifted away.">
      <div ref={ref} className="in-shelf" aria-hidden="true">
        <div className="in-shelf-row">
          {SHELF.map((sku) => (
            <motion.span
              key={sku}
              className="in-shelf-item"
              data-sku={sku}
              animate={sku === TAKEN && gone ? { y: -54, rotate: 7, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
              transition={spring}
            >
              <Cutout sku={sku} />
            </motion.span>
          ))}
        </div>
        <div className="in-shelf-board" />
      </div>
    </Frame>
  );
}

/* 2. The grid of blocks the stand compares, lighting where the picture changed. */
const GRID_HOLDS = [1600, 900, 900, 1500, 2600] as const;
const GRID_SAYS = ["The shelf is still", "Something is moving", "Something is moving", "Still for one second", "This area changed: read it"];

const blob = (cx: number, cy: number, rx: number, ry: number) => {
  const set = new Set<number>();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 <= 1) set.add(row * GRID_COLS + col);
    }
  }
  return set;
};
const REACH_IN = blob(17.5, 4.5, 5, 3.2);
const REACH_AT = blob(12.5, 9, 4.6, 3.4);
const CHANGED = blob(8, 11, 1.9, 2.9);
const union = (a: Set<number>, b: Set<number>) => new Set([...a, ...b]);
const GRID_LIT = [new Set<number>(), REACH_IN, union(REACH_AT, CHANGED), CHANGED, CHANGED];
// The smallest rectangle of blocks that holds the change, as the detector reports it.
const CHANGED_BOX = (() => {
  const cols = [...CHANGED].map((i) => i % GRID_COLS);
  const rows = [...CHANGED].map((i) => Math.floor(i / GRID_COLS));
  const c0 = Math.min(...cols);
  const r0 = Math.min(...rows);
  return {
    left: `${(c0 / GRID_COLS) * 100}%`,
    top: `${(r0 / GRID_ROWS) * 100}%`,
    width: `${((Math.max(...cols) - c0 + 1) / GRID_COLS) * 100}%`,
    height: `${((Math.max(...rows) - r0 + 1) / GRID_ROWS) * 100}%`,
  };
})();
const CELLS = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => i);

export function GridVis() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, GRID_HOLDS);
  const lit = GRID_LIT[phase];
  return (
    <Frame label={`The picture cut into a grid of ${GRID_COLS} by ${GRID_ROWS} blocks. Blocks light where a hand moves, then only where an item has gone.`}>
      <div ref={ref} className="in-grid-wrap" aria-hidden="true">
        <div className="in-grid" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}>
          {CELLS.map((i) => (
            <span key={i} data-on={lit.has(i) || undefined} data-held={(phase >= 3 && lit.has(i)) || undefined} />
          ))}
          <motion.span
            className="in-grid-box"
            style={CHANGED_BOX}
            initial={false}
            animate={phase === 4 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.12 }}
            transition={springSnappy}
          />
        </div>
        <p className="in-vis-status">
          <span className="in-vis-dot" data-live={phase === 1 || phase === 2 || undefined} />
          {GRID_SAYS[phase]}
        </p>
      </div>
    </Frame>
  );
}

/* 3. Before and after, a scan frame, and the only thing the model sends back. */
const PAIR_HOLDS = [1300, 1700, 3200] as const;
const PAIR_SHELF = ["jam", "honey", "eggs", "bread"];

export function Photo({ label, without }: { label: string; without?: string }) {
  return (
    <div className="in-photo">
      <span className="in-photo-label">{label}</span>
      <div className="in-photo-row">
        {PAIR_SHELF.map((sku) => (
          <span key={sku} className="in-photo-item" data-gone={sku === without || undefined}>
            <Cutout sku={sku} />
          </span>
        ))}
      </div>
      <div className="in-photo-board" />
    </div>
  );
}

export function PairVis() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, PAIR_HOLDS);
  const reduce = useReducedMotion();
  return (
    <Frame label="A photo of the shelf before and one after. A frame marks the place that changed, and the model answers with one product id and a count.">
      <div ref={ref} className="in-pair" aria-hidden="true">
        <div className="in-pair-photos">
          {["Before", "After"].map((label, i) => (
            <div key={label} className="in-pair-cell">
              <Photo label={label} without={i === 1 ? TAKEN : undefined} />
              <motion.span
                className="in-scan"
                initial={false}
                animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduce ? 1 : 1.5 }}
                transition={{ ...spring, delay: phase >= 1 ? i * 0.12 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="in-pair-out">
          <span className="in-pair-out-label">The model returns</span>
          <motion.code
            className="in-code"
            initial={false}
            animate={phase >= 2 ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0.25, y: 0, filter: reduce ? "blur(0px)" : "blur(4px)" }}
            transition={{ duration: 0.4, ease: easeOut }}
          >
            {`{ "sku": "${TAKEN}", "qty": 1 }`}
          </motion.code>
          <span className="in-pair-never">Never asked for: a price, a total, or who it was</span>
        </div>
      </div>
    </Frame>
  );
}

/* 4. The visit the server opens, and a second change joining it. */
const VISIT_HOLDS = [2200, 3400] as const;

export function VisitVis({ items, joinSeconds }: { items: Item[]; joinSeconds: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, VISIT_HOLDS);
  const joined = phase > 0;
  const total = price(items, TAKEN) + (joined ? price(items, JOINED) : 0);
  return (
    <Frame label="A visit with one line, honey. A second item taken within the minute joins the same visit and the total goes up.">
      <div ref={ref} className="in-sheet" aria-hidden="true">
        <div className="in-sheet-head">
          <span>Visit</span>
          <StatusBadge tone="open">Open</StatusBadge>
        </div>
        <ul className="in-lines">
          {[TAKEN, JOINED].map((sku) => (
            <motion.li
              key={sku}
              initial={false}
              animate={sku === TAKEN || joined ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={spring}
            >
              <span>
                {nameOf(items, sku)}
                {sku === JOINED && <em>joined within {joinSeconds} seconds</em>}
              </span>
              <span className="in-lines-qty">1 × {usd(price(items, sku))}</span>
              <span className="num">{usd(price(items, sku))}</span>
            </motion.li>
          ))}
        </ul>
        <div className="in-sheet-total">
          <span>Total, added up on the server</span>
          <Rolling className="num" value={total} text={usd(total)} />
        </div>
      </div>
    </Frame>
  );
}

/* 5. The stand screen: the bill and the code to pay it. */
export function StandVis({ items }: { items: Item[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const lines = [TAKEN, JOINED];
  const total = lines.reduce((sum, sku) => sum + price(items, sku), 0);
  return (
    <Frame label={`The stand screen showing a bill of ${usd(total)} and a code to scan.`} className="in-vis-bare">
      <motion.div
        ref={ref}
        className="in-stand void"
        aria-hidden="true"
        initial={false}
        animate={inView || reduce ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, scale: 0.96, filter: "blur(8px)" }}
        transition={spring}
      >
        <div className="in-stand-bill">
          <span className="in-stand-label">Your bill</span>
          <ul>
            {lines.map((sku) => (
              <li key={sku}>
                <span>1 × {nameOf(items, sku)}</span>
                <span className="num">{usd(price(items, sku))}</span>
              </li>
            ))}
          </ul>
          <span className="in-stand-total num">{usd(total)}</span>
        </div>
        <div className="in-stand-code">
          <DrawnCode />
          <span>Scan to pay with PayPal</span>
        </div>
      </motion.div>
    </Frame>
  );
}

/* 6. The pay page: a bill you can correct, and the PayPal button. */
export function PayVis({ items }: { items: Item[] }) {
  const detected = useMemo(() => ({ [TAKEN]: 1, [JOINED]: 1 }) as Record<string, number>, []);
  const [qty, setQty] = useState(detected);
  const [paid, setPaid] = useState(false);
  const total = Object.entries(qty).reduce((sum, [sku, n]) => sum + price(items, sku) * n, 0);
  const adjusted = Object.keys(detected).some((sku) => qty[sku] !== detected[sku]);

  return (
    <Frame label="A working model of the pay page. Change the quantities and the total follows." className="in-vis-bare">
      <div className="in-phone">
        <AnimatePresence mode="popLayout" initial={false}>
          {paid ? (
            <motion.div
              key="paid"
              className="in-phone-paid"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={springBouncy}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="22" />
                <path d="M15 24.5l6.2 6.2L33.5 18" />
              </svg>
              <p className="in-phone-paid-title">Paid, thank you</p>
              <p className="num">{usd(total)}</p>
              {adjusted && <StatusBadge tone="adjusted">Shown to the owner as adjusted</StatusBadge>}
              <button
                type="button"
                className="in-link ds-focus"
                onClick={() => {
                  setPaid(false);
                  setQty(detected);
                }}
              >
                Start again
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="bill"
              className="in-phone-bill"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={spring}
            >
              <div className="in-sheet-head">
                <span>Your bill</span>
                {adjusted && <StatusBadge tone="adjusted">Adjusted</StatusBadge>}
              </div>
              <ul className="in-lines in-lines-edit">
                {Object.keys(detected).map((sku) => (
                  <li key={sku} data-zero={qty[sku] === 0 || undefined}>
                    <span>
                      {nameOf(items, sku)}
                      <em>{usd(price(items, sku))} each</em>
                    </span>
                    <Stepper name={nameOf(items, sku)} qty={qty[sku]} onChange={(n) => setQty((q) => ({ ...q, [sku]: n }))} />
                  </li>
                ))}
              </ul>
              <div className="in-sheet-total">
                <span>Total to pay</span>
                <Rolling className="num" value={total} text={usd(total)} />
              </div>
              <button type="button" className="in-paypal ds-focus" disabled={total === 0} onClick={() => setPaid(true)}>
                {total === 0 ? "Nothing to pay" : "Pay with PayPal"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <figcaption className="in-vis-note">A model of the pay page. Nothing is charged here.</figcaption>
    </Frame>
  );
}

/* 7. Ten minutes pass and the visit's status changes; a late payment changes it again. */
const STATUS_HOLDS = [3000, 2600, 2600] as const;

export function StatusVis({ items, minutes, hours }: { items: Item[]; minutes: number; hours: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, STATUS_HOLDS);
  const reduce = useReducedMotion();
  const total = price(items, TAKEN) + price(items, JOINED);
  const states: { tone: Tone; label: string; note: string }[] = [
    { tone: "open", label: "Open", note: `Waiting for payment, up to ${minutes} minutes` },
    { tone: "unmatched", label: "Unmatched", note: `Nothing paid. The same link still works for ${hours} hours` },
    { tone: "paid", label: "Paid late", note: "Paid from the same link, after the stand moved on" },
  ];
  const now = states[phase];
  return (
    <Frame label={`A visit that is open, then unmatched after ${minutes} minutes, then paid late.`}>
      <div ref={ref} className="in-status" aria-hidden="true">
        <div className="in-status-row">
          <span className="in-status-what">
            1 × {nameOf(items, TAKEN)}, 1 × {nameOf(items, JOINED)}
          </span>
          <span className="num">{usd(total)}</span>
          <span className="in-status-badge">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={now.label}
                initial={reduce ? { opacity: 0 } : { opacity: 0, rotateX: -80, y: 6 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, rotateX: 0, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, rotateX: 80, y: -6 }}
                transition={springSnappy}
              >
                <StatusBadge tone={now.tone}>{now.label}</StatusBadge>
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
        <div className="in-status-clock">
          <motion.span
            key={phase === 0 ? "run" : "full"}
            initial={{ scaleX: phase === 0 && !reduce ? 0 : 1 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: phase === 0 ? STATUS_HOLDS[0] / 1000 : 0, ease: "linear" }}
            data-tone={now.tone}
          />
        </div>
        <p className="in-status-note">{now.note}</p>
      </div>
    </Frame>
  );
}

/* 8. What reaches the owner: the latest rows of the demo stand's week. */
export type PeekRow = { id: string; what: string; tone: Tone; status: string; amount: string };

export function OwnerVis({ rows }: { rows: PeekRow[] }) {
  return (
    <Frame label="The owner's list of visits, each with what was taken, its status and the amount.">
      <ul className="in-peek">
        {rows.map((r) => (
          <li key={r.id}>
            <span className="in-peek-what">{r.what}</span>
            <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
            <span className="num">{r.amount}</span>
          </li>
        ))}
      </ul>
      <figcaption className="in-vis-note">Example visits from the demo stand, not real sales.</figcaption>
    </Frame>
  );
}
