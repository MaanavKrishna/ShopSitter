"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { spring, springSnappy } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import { useStill } from "./useStill";
import { MiniCode } from "./visuals";
import type { StoreItem } from "./StoreTeaser";

type Mode = "after" | "hold";
const MODES: { id: Mode; label: string }[] = [
  { id: "after", label: "Pay after" },
  { id: "hold", label: "Hold first" },
];
const HOLD_CENTS = 2500;

/**
 * The two ways a shop can take payment, as a switch over a small phone. A model with the demo
 * catalogue's prices: the hold amount shown is an example, not a shop's real figure.
 */
export function PayModes({ basket }: { basket: (StoreItem & { qty: number })[] }) {
  const reduce = useStill();
  const [mode, setMode] = useState<Mode>("hold");
  const total = basket.reduce((s, l) => s + l.unitCents * l.qty, 0);
  const released = Math.max(0, HOLD_CENTS - total);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = mode === "after" ? "hold" : "after";
    setMode(next);
    (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
  };

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: mode === "hold" ? 24 : -24, filter: "blur(6px)" },
        animate: { opacity: 1, x: 0, filter: "blur(0px)" },
        exit: { opacity: 0, filter: "blur(6px)" },
      };

  return (
    <div className="lp-pay">
      <div className="lp-pay-copy">
        <div className="lp-seg" role="radiogroup" aria-label="How the shopper pays" onKeyDown={onKey}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              data-mode={m.id}
              aria-checked={mode === m.id}
              tabIndex={mode === m.id ? 0 : -1}
              className="lp-seg-btn ds-focus"
              onClick={() => setMode(m.id)}
            >
              {mode === m.id && <motion.span layoutId="lp-seg-pill" className="lp-seg-pill" transition={springSnappy} />}
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        {mode === "after" ? (
          <div className="lp-pay-text">
            <h3>Take, then pay at the shelf</h3>
            <p>
              Take what you like. The shelf&apos;s screen shows the bill and a PayPal code. Scan it, fix the bill if the
              camera got it wrong, and pay on your phone.
            </p>
          </div>
        ) : (
          <div className="lp-pay-text">
            <h3>Scan at the door, then just leave</h3>
            <p>
              We hold $25. You&apos;re charged only for what you take; the rest is released. Your basket fills on your
              phone as the shelves are read. Tap Done, or simply walk out.
            </p>
            <p className="lp-pay-rule">
              How the amount is chosen: enough to cover nine in ten baskets at this shop over the last 30 days, rounded
              up to the next $5, kept between the owner&apos;s minimum and maximum.
            </p>
          </div>
        )}
        <p className="lp-model-note">A model. The $25 hold is an example; each shop&apos;s hold comes from its own sales.</p>
      </div>

      <div className="lp-phone lp-pay-phone" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={mode} className="lp-phone-in" {...swap} transition={spring}>
            {mode === "after" ? (
              <>
                <p className="lp-phone-title">Your bill</p>
                <BasketLines basket={basket} />
                <p className="lp-phone-total">
                  <span>Total</span>
                  <b className="num">${formatCents(total)}</b>
                </p>
                <MiniCode className="lp-pay-code" />
                <span className="lp-pay-pp">Pay with PayPal</span>
              </>
            ) : (
              <>
                <p className="lp-phone-title">Your basket</p>
                <BasketLines basket={basket} />
                <div className="lp-hold">
                  <div className="lp-hold-track" aria-hidden="true">
                    <motion.span
                      className="lp-hold-used"
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: total / HOLD_CENTS }}
                      transition={reduce ? { duration: 0 } : { ...spring, delay: 0.25 }}
                    />
                  </div>
                  <p>
                    <span>
                      Charged <b className="num">${formatCents(total)}</b>
                    </span>
                    <span>
                      Released <b className="num">${formatCents(released)}</b>
                    </span>
                  </p>
                  <p className="lp-hold-of">of a $25.00 hold</p>
                </div>
                <span className="lp-pay-done">Done</span>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function BasketLines({ basket }: { basket: (StoreItem & { qty: number })[] }) {
  return (
    <ul className="lp-phone-lines">
      {basket.map((l) => (
        <li key={l.sku}>
          <span className="num">{l.qty} ×</span>
          <span>{l.name}</span>
          <span className="num">${formatCents(l.unitCents * l.qty)}</span>
        </li>
      ))}
    </ul>
  );
}
