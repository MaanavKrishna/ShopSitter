"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { springBouncy, springSnappy, spring } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import { useStill } from "./useStill";
import { Cutout } from "./visuals";

export type StoreItem = { sku: string; name: string; unitCents: number };
type Shelf = { id: number; aisle: string; item: StoreItem };

const STOCK = 3;
/** The ledger bar is drawn against this much value, so a few taps visibly fill it. */
const SCALE_CENTS = 6000;

/**
 * A toy store: two aisles of shelves, each with its own camera. Tapping a shelf takes one item;
 * the shelf's camera dot lights, the item springs into the basket on the phone, and the value
 * taken grows on a small ledger bar. A model only: nothing here talks to a server.
 */
export function StoreTeaser({ items }: { items: StoreItem[] }) {
  const reduce = useStill();
  const shelves: Shelf[] = items.map((item, i) => ({ id: i + 1, aisle: i < 2 ? "Aisle 1" : "Aisle 2", item }));
  const [taken, setTaken] = useState<Record<string, number>>({});
  const [last, setLast] = useState<number | null>(null);

  const take = (s: Shelf) => {
    setTaken((t) => {
      const n = t[s.item.sku] ?? 0;
      return n >= STOCK ? t : { ...t, [s.item.sku]: n + 1 };
    });
    setLast(s.id);
  };
  const reset = () => {
    setTaken({});
    setLast(null);
  };

  const lines = shelves.filter((s) => (taken[s.item.sku] ?? 0) > 0);
  const total = lines.reduce((sum, s) => sum + s.item.unitCents * (taken[s.item.sku] ?? 0), 0);
  const count = lines.reduce((sum, s) => sum + (taken[s.item.sku] ?? 0), 0);
  const aisles = ["Aisle 1", "Aisle 2"];

  return (
    <div className="lp-store">
      <div className="lp-store-map" role="group" aria-label="A model store map. Tap a shelf to take one item.">
        {aisles.map((a) => (
          <div key={a} className="lp-store-aisle">
            <p className="lp-store-aisle-name">{a}</p>
            <div className="lp-store-shelves">
              {shelves
                .filter((s) => s.aisle === a)
                .map((s) => {
                  const left = STOCK - (taken[s.item.sku] ?? 0);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="lp-store-shelf ds-focus"
                      onClick={() => take(s)}
                      disabled={left === 0}
                      aria-label={`Shelf ${s.id}, ${s.item.name}: take one. ${left} left.`}
                    >
                      <span className="lp-store-shelf-top">
                        <span>Shelf {s.id}</span>
                        <motion.i
                          className="lp-store-cam"
                          aria-hidden="true"
                          key={last === s.id ? `${s.id}-${count}` : s.id}
                          initial={last === s.id && !reduce ? { scale: 1.9, opacity: 0.4 } : false}
                          animate={{ scale: 1, opacity: 1 }}
                          data-live={last === s.id || undefined}
                          transition={springSnappy}
                        />
                      </span>
                      <span className="lp-store-cut" aria-hidden="true">
                        <Cutout sku={s.item.sku} />
                      </span>
                      <span className="lp-store-stock" aria-hidden="true">
                        {Array.from({ length: STOCK }, (_, i) => (
                          <i key={i} data-gone={i >= left || undefined} />
                        ))}
                      </span>
                      <span className="lp-store-name">{s.item.name}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        <p className="lp-store-door" aria-hidden="true">
          <span>Door</span>
        </p>
      </div>

      <div className="lp-store-side">
        <div className="lp-phone" aria-live="polite">
          <div className="lp-phone-in">
            <p className="lp-phone-title">Your basket</p>
            <ul className="lp-phone-lines">
              <AnimatePresence initial={false}>
                {lines.map((s) => (
                  <motion.li
                    key={s.item.sku}
                    layout={!reduce}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={springBouncy}
                  >
                    <span className="num">{taken[s.item.sku]} ×</span>
                    <span>{s.item.name}</span>
                    <span className="num">${formatCents(s.item.unitCents * (taken[s.item.sku] ?? 0))}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {lines.length === 0 && <li className="lp-phone-empty">Tap a shelf to take something.</li>}
            </ul>
            <p className="lp-phone-total">
              <span>Total</span>
              <b className="num">${formatCents(total)}</b>
            </p>
          </div>
        </div>

        <div className="lp-store-ledger">
          <p>
            <span>Taken from the shelves</span>
            <b className="num">${formatCents(total)}</b>
          </p>
          <div className="lp-store-track" aria-hidden="true">
            <motion.span
              initial={false}
              animate={{ scaleX: Math.min(1, total / SCALE_CENTS) }}
              transition={reduce ? { duration: 0 } : spring}
            />
          </div>
          <button type="button" className="lp-store-reset ds-focus" onClick={reset} disabled={count === 0}>
            Put everything back
          </button>
        </div>
      </div>
      <p className="lp-model-note">A working model, not the live store. Prices come from the demo catalogue.</p>
    </div>
  );
}
