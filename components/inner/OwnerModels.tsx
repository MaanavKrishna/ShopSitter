"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { suggestedHoldCents } from "@/lib/hold";
import { spring } from "@/lib/motion";
import { usd } from "./bits";
import "./owners-trust.css";

// Made-up paid baskets for the model only, in cents. Not anybody's sales.
const BASKETS = [
  450, 600, 650, 800, 900, 950, 1100, 1200, 1250, 1300, 1450, 1500, 1700, 1800, 1950, 2100, 2300, 2650, 3400, 4800,
];
const FEW = BASKETS.slice(0, 6);
const AXIS = 6000;
const pct = (cents: number) => `${Math.min(100, (cents / AXIS) * 100)}%`;

/** The suggested-hold rule from lib/hold.ts, run live on made-up baskets. */
export function HoldModel() {
  const [floor, setFloor] = useState(1000);
  const [cap, setCap] = useState(4000);
  const [few, setFew] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const baskets = few ? FEW : BASKETS;
  const hold = suggestedHoldCents(baskets, { holdOverrideCents: null, holdFloorCents: floor, holdCapCents: Math.max(cap, floor) });
  const covered = baskets.filter((b) => b <= hold).length;

  return (
    <div className="in-spec ot-hold" role="group" aria-label="A model of the suggested hold">
      <p className="ot-model-tag">A model, with made-up baskets</p>
      <div className="ot-hold-head">
        <span>Suggested hold</span>
        <motion.span key={hold} className="num ot-hold-fig" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {usd(hold)}
        </motion.span>
      </div>
      <div className="ot-axis" aria-hidden="true">
        <motion.span className="ot-band" initial={false} animate={{ left: pct(floor), width: `calc(${pct(Math.max(cap, floor))} - ${pct(floor)})` }} transition={spring} />
        {baskets.map((b, i) => (
          <span key={i} className="ot-dot" data-in={b <= hold || undefined} style={{ left: pct(b) }} />
        ))}
        <motion.span className="ot-mark" initial={false} animate={{ left: pct(hold) }} transition={spring} />
      </div>
      <p className="ot-hold-note" aria-live="polite">
        {few
          ? `Only ${baskets.length} paid baskets so far, so the hold is twice your minimum.`
          : `Covers ${covered} of ${baskets.length} paid baskets, rounded up to the next $5.`}
      </p>
      <div className="ot-hold-controls">
        <label htmlFor={`${id}-floor`}>
          <span>Minimum</span>
          <span className="num">{usd(floor)}</span>
        </label>
        <input id={`${id}-floor`} className="ds-focus" type="range" min={500} max={4000} step={500} value={floor} onChange={(e) => setFloor(Number(e.target.value))} />
        <label htmlFor={`${id}-cap`}>
          <span>Maximum</span>
          <span className="num">{usd(Math.max(cap, floor))}</span>
        </label>
        <input id={`${id}-cap`} className="ds-focus" type="range" min={1000} max={6000} step={500} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
      </div>
      <button type="button" className="in-spec-btn ds-focus" aria-pressed={few} onClick={() => setFew((f) => !f)}>
        {few ? "Show 20 paid baskets" : "Show a new shop with 6"}
      </button>
    </div>
  );
}

export type ShelfTile = { name: string; aisle: string; taken: string; unmatched: string; look: boolean };

/** Shelf tiles as the store map shows them: what left each shelf and what is unmatched there. */
export function ShelfTiles({ shelves }: { shelves: ShelfTile[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="in-spec ot-shelves">
      <p className="ot-model-tag">The demo week, laid out on three example shelves</p>
      <ul>
        {shelves.map((s, i) => (
          <li key={s.name}>
            <button type="button" className="ot-shelf ds-focus" data-look={s.look || undefined} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className="ot-shelf-aisle">{s.aisle}</span>
              <span className="ot-shelf-name">{s.name}</span>
              <span className="ot-shelf-fig">
                <span>Unmatched</span>
                <span className="num">{s.unmatched}</span>
              </span>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.span
                    className="ot-shelf-more"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={spring}
                  >
                    <span>Taken this week</span>
                    <span className="num">{s.taken}</span>
                    <span className="ot-shelf-qr">Has its own camera link and QR</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </li>
        ))}
      </ul>
      <p className="in-spec-hint">Tap a shelf to open it.</p>
    </div>
  );
}
