"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { spring, springBouncy, springSnappy } from "@/lib/motion";
import { Cutout, DrawnCode, type Item, StatusBadge, usd } from "./bits";
import { Rolling } from "./Stepper";
import { usePhase } from "./usePhase";
import "./how-store.css";

const price = (items: Item[], sku: string) => items.find((i) => i.sku === sku)?.priceCents ?? 0;
const nameOf = (items: Item[], sku: string) => items.find((i) => i.sku === sku)?.name ?? sku;

function Model({ label, children, note }: { label: string; children: React.ReactNode; note: string }) {
  return (
    <figure className="in-vis hs-vis" aria-label={label}>
      {children}
      <figcaption className="in-vis-note">{note}</figcaption>
    </figure>
  );
}

/* 1. A small store: shelves grouped by aisle, each with its own camera. */
const AISLES = [
  { name: "Aisle 1", shelves: [{ name: "Shelf 1", sku: "honey", cam: "Phone" }, { name: "Shelf 2", sku: "jam", cam: "Phone" }] },
  { name: "Aisle 2", shelves: [{ name: "Shelf 3", sku: "bread", cam: "Webcam" }, { name: "Shelf 4", sku: "eggs", cam: "CCTV" }] },
];
const SETUP_HOLDS = [900, 900, 900, 900, 2600] as const;

export function StoreSetupVis() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, SETUP_HOLDS);
  let n = 0;
  return (
    <Model
      label="A store map with two aisles of two shelves. Each shelf has its own camera: phones, a webcam, a CCTV camera."
      note="A drawing of a small store, not a real one."
    >
      <div ref={ref} className="hs-map" aria-hidden="true">
        {AISLES.map((a) => (
          <div key={a.name} className="hs-aisle">
            <span className="hs-aisle-name">{a.name}</span>
            <div className="hs-aisle-row">
              {a.shelves.map((s) => {
                const on = phase >= ++n || phase === SETUP_HOLDS.length - 1;
                return (
                  <motion.div
                    key={s.name}
                    className="hs-tile"
                    data-on={on || undefined}
                    initial={false}
                    animate={on ? { opacity: 1, scale: 1 } : { opacity: 0.45, scale: 0.97 }}
                    transition={spring}
                  >
                    <span className="hs-tile-photo">
                      <Cutout sku={s.sku} />
                    </span>
                    <span className="hs-tile-name">{s.name}</span>
                    <span className="hs-cam" data-kind={s.cam}>
                      <span className="hs-cam-dot" />
                      {s.cam}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Model>
  );
}

/* 2. The door: a QR to check in, and an optional hold. */
export function DoorVis() {
  return (
    <Model label="The door code. Scanning it opens a basket on the shopper's phone." note="Both the code and the hold are optional.">
      <div className="hs-door" aria-hidden="true">
        <div className="hs-door-code">
          <DrawnCode />
          <span>Scan to check in</span>
        </div>
        <div className="hs-phone">
          <span className="hs-phone-bar" />
          <span className="hs-phone-title">Your basket</span>
          <span className="hs-phone-empty">Empty. Take what you like.</span>
          <span className="hs-phone-hold">
            <b>Hold $25.00</b>
            <span>Charged only for what you take</span>
          </span>
        </div>
      </div>
    </Model>
  );
}

/* 5. Several shoppers: a change waits on their phones until one of them claims it. */
export function ClaimVis({ items }: { items: Item[] }) {
  const [state, setState] = useState<"asking" | "mine" | "not">("asking");
  const sku = "honey";
  const cents = price(items, sku);
  return (
    <Model
      label="A working model of a claim card on a shopper's phone."
      note="A working model. Try Yes, mine or Not mine."
    >
      <div className="hs-claim">
        <AnimatePresence mode="popLayout" initial={false}>
          {state === "asking" ? (
            <motion.div
              key="ask"
              className="hs-claim-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={springSnappy}
            >
              <p className="hs-claim-q">Shelf 3 saw 1 × {nameOf(items, sku)} leave. Yours?</p>
              <p className="hs-claim-sum num">{usd(cents)}</p>
              <div className="hs-claim-actions">
                <button type="button" className="hs-yes ds-press ds-focus" onClick={() => setState("mine")}>
                  Yes, mine
                </button>
                <button type="button" className="hs-no ds-press ds-focus" onClick={() => setState("not")}>
                  Not mine
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="after"
              className="hs-claim-after"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={springSnappy}
            >
              <p role="status">
                {state === "mine"
                  ? "Added to your basket. Nobody else can claim it now."
                  : "Hidden on this phone. It waits for the shopper it belongs to."}
              </p>
              <button type="button" className="hs-again ds-press ds-focus" onClick={() => setState("asking")}>
                Ask again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="in-sheet hs-claim-basket">
          <div className="in-sheet-head">
            <span>Your basket</span>
            <StatusBadge tone="open">Open</StatusBadge>
          </div>
          <ul className="in-lines">
            <AnimatePresence initial={false}>
              {state === "mine" && (
                <motion.li
                  key="honey"
                  initial={{ opacity: 0, y: -14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={springBouncy}
                >
                  <span>{nameOf(items, sku)}</span>
                  <span className="in-lines-qty">1 × {usd(cents)}</span>
                  <span className="num">{usd(cents)}</span>
                </motion.li>
              )}
            </AnimatePresence>
          </ul>
          <div className="in-sheet-total">
            <span>Total</span>
            <Rolling className="num" value={state === "mine" ? cents : 0} text={usd(state === "mine" ? cents : 0)} />
          </div>
        </div>
      </div>
    </Model>
  );
}

/* 6. A jar put back comes off the bill. */
const RETURN_HOLDS = [2200, 3000] as const;

export function ReturnVis({ items }: { items: Item[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, RETURN_HOLDS);
  const back = phase > 0;
  const lines = ["honey", "jam"];
  const total = lines.reduce((s, sku) => s + (sku === "jam" && back ? 0 : price(items, sku)), 0);
  return (
    <Model label="A basket of honey and jam. The jam goes back on the shelf and comes off the bill." note="A drawing of a basket, played on a loop.">
      <div ref={ref} className="in-sheet" aria-hidden="true">
        <div className="in-sheet-head">
          <span>Your basket</span>
          <StatusBadge tone="open">Open</StatusBadge>
        </div>
        <ul className="in-lines">
          {lines.map((sku) => {
            const gone = sku === "jam" && back;
            return (
              <motion.li key={sku} className="hs-line" data-gone={gone || undefined} initial={false} animate={{ opacity: gone ? 0.45 : 1 }} transition={spring}>
                <span>
                  {nameOf(items, sku)}
                  {sku === "jam" && <em>{gone ? "Put back on Shelf 2" : "From Shelf 2"}</em>}
                </span>
                <span className="in-lines-qty">{gone ? "0" : "1"} × {usd(price(items, sku))}</span>
                <span className="num">{usd(gone ? 0 : price(items, sku))}</span>
              </motion.li>
            );
          })}
        </ul>
        <div className="in-sheet-total">
          <span>Total</span>
          <Rolling className="num" value={total} text={usd(total)} />
        </div>
      </div>
    </Model>
  );
}

/* 7. The hold: PayPal sets aside an amount, the basket fills it, the rest is released. */
const HOLD_CENTS = 2500;
const HOLD_HOLDS = [1400, 2600, 3400] as const;

export function HoldVis({ items }: { items: Item[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const phase = usePhase(ref, HOLD_HOLDS);
  const basket = ["honey", "jam", "bread"].reduce((s, sku) => s + price(items, sku), 0);
  const total = Math.min(basket, HOLD_CENTS);
  const released = HOLD_CENTS - total;
  const fill = phase === 0 ? 0 : total / HOLD_CENTS;
  const says = ["PayPal holds $25.00", "Your basket fills", "Done: charged for what you took"];
  return (
    <Model
      label={`A hold of ${usd(HOLD_CENTS)}. The basket comes to ${usd(total)}, which is captured, and ${usd(released)} is released.`}
      note="A drawing with example prices from the demo shop."
    >
      <div ref={ref} className="hs-hold" aria-hidden="true">
        <div className="hs-hold-head">
          <span>{says[phase]}</span>
          <span className="num">{usd(HOLD_CENTS)} held</span>
        </div>
        <div className="hs-meter">
          <motion.span
            className="hs-meter-fill"
            initial={false}
            animate={{ scaleX: fill, opacity: fill > 0 ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : spring}
          />
          <motion.span
            className="hs-meter-rest"
            initial={false}
            animate={{ opacity: phase === 2 ? 1 : 0 }}
            style={{ left: `${(total / HOLD_CENTS) * 100}%` }}
            transition={spring}
          />
        </div>
        <dl className="hs-hold-figs">
          <div>
            <dt>{phase === 2 ? "Charged" : "Basket"}</dt>
            <dd>
              <Rolling className="num hs-hold-big" value={phase === 0 ? 0 : total} text={usd(phase === 0 ? 0 : total)} />
            </dd>
          </div>
          <div data-tone={phase === 2 ? "released" : undefined}>
            <dt>Released</dt>
            <dd className="num">{phase === 2 ? usd(released) : "Not yet"}</dd>
          </div>
        </dl>
      </div>
    </Model>
  );
}
