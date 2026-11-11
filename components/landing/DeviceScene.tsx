"use client";

import { useStill } from "./useStill";
import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { formatCents } from "@/lib/money";
import type { PricedBill } from "@/lib/types";
import { MiniCode } from "./visuals";

// Where in the pinned scroll each thing happens (0 = scene pinned, 1 = scene released).
const FLAT_AT = 0.42;
const LINES_FROM = 0.4;
const LINE_STEP = 0.11;
const LINE_SPAN = 0.12;
const CODE_FROM = 0.74;

/**
 * The stand screen inside a tablet. The scene pins while you scroll: the tablet tilts flat,
 * the bill's lines resolve one after another, the total counts up and the code arrives.
 * Rendered finished by default; scrolling takes over once the page is live.
 */
export function DeviceScene({ bill }: { bill: PricedBill }) {
  const scene = useRef<HTMLElement>(null);
  const reduce = useStill();
  const { scrollYProgress } = useScroll({ target: scene, offset: ["start start", "end end"] });

  // Starts finished, so the server-rendered page shows the whole bill.
  const p = useMotionValue(1);
  useEffect(() => {
    p.set(reduce ? 1 : scrollYProgress.get());
  }, [p, reduce, scrollYProgress]);
  useMotionValueEvent(scrollYProgress, "change", (v) => p.set(reduce ? 1 : v));

  const rotateX = useTransform(p, [0, FLAT_AT], [34, 0], { clamp: true });
  const scale = useTransform(p, [0, FLAT_AT], [0.84, 1], { clamp: true });
  const lift = useTransform(p, [0, FLAT_AT], [36, 0], { clamp: true });
  const glare = useTransform(p, [0, FLAT_AT], [0.5, 0], { clamp: true });
  const shadow = useTransform(p, [0, FLAT_AT], [0.35, 1], { clamp: true });

  // The total climbs by each line's amount while that line resolves, so the two always agree.
  const stops: number[] = [];
  const sums: number[] = [];
  bill.lines.reduce((sum, l, i) => {
    stops.push(LINES_FROM + i * LINE_STEP, LINES_FROM + i * LINE_STEP + LINE_SPAN * 0.9);
    sums.push(sum, sum + l.lineCents);
    return sum + l.lineCents;
  }, 0);
  const total = useTransform(p, stops, sums, { clamp: true });
  const totalText = useTransform(total, (c) => `$${formatCents(Math.round(c))}`);
  const codeOpacity = useTransform(p, [CODE_FROM, CODE_FROM + 0.12], [0, 1], { clamp: true });
  const codeScale = useTransform(p, [CODE_FROM, CODE_FROM + 0.12], [0.94, 1], { clamp: true });

  return (
    <section
      ref={scene}
      id="bill"
      className="lp-scene"
      data-tone="light"
      data-still={reduce ? "true" : undefined}
      aria-labelledby="bill-h"
    >
      <div className="lp-scene-pin">
        <div className="lp-scene-head ds-container">
          <h2 id="bill-h" className="ds-h1">
            The shelf writes the bill
          </h2>
          <p className="ds-lead">
            Nobody stands at this stand. The customer installs no app and scans no barcodes: one QR code, then PayPal.
          </p>
        </div>

        <div className="lp-scene-stage">
          <motion.div className="lp-tablet" style={{ rotateX, scale, y: lift }}>
            <motion.div className="lp-tablet-shadow" style={{ opacity: shadow }} aria-hidden="true" />
            <div className="lp-tablet-body">
              <div className="void lp-stand" role="img" aria-label={standLabel(bill)}>
                <div className="lp-stand-in" aria-hidden="true">
                  <span className="lp-stand-mark">Shopsitter</span>
                  <div className="lp-stand-bill">
                    <p className="lp-stand-title">Your bill</p>
                    <ul className="lp-stand-lines">
                      {bill.lines.map((l, i) => (
                        <StandLine key={l.sku} p={p} from={LINES_FROM + i * LINE_STEP}>
                          <b>{l.qty}</b>
                          <i>×</i>
                          <span>{l.name}</span>
                          <span className="num">${formatCents(l.lineCents)}</span>
                        </StandLine>
                      ))}
                    </ul>
                  </div>
                  <div className="lp-stand-pay">
                    <p className="lp-stand-total-label">Total</p>
                    <motion.p className="num lp-stand-total">{totalText}</motion.p>
                    <motion.div className="lp-stand-code" style={{ opacity: codeOpacity, scale: codeScale }}>
                      <MiniCode />
                      <p>
                        <span className="lp-stand-code-dash" />
                        <strong>Scan to pay with PayPal</strong>
                        <small>Wrong? Fix it on your phone.</small>
                      </p>
                    </motion.div>
                  </div>
                </div>
              </div>
              <motion.div className="lp-tablet-glare" style={{ opacity: glare }} aria-hidden="true" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

const standLabel = (bill: PricedBill) =>
  `The stand screen. Your bill: ${bill.lines.map((l) => `${l.qty} ${l.name}, $${formatCents(l.lineCents)}`).join("; ")}. Total $${formatCents(bill.totalCents)}. Scan to pay with PayPal.`;

function StandLine({ p, from, children }: { p: MotionValue<number>; from: number; children: React.ReactNode }) {
  const opacity = useTransform(p, [from, from + LINE_SPAN], [0, 1], { clamp: true });
  const y = useTransform(p, [from, from + LINE_SPAN], [10, 0], { clamp: true });
  const filter = useTransform(p, [from, from + LINE_SPAN], ["blur(6px)", "blur(0px)"], { clamp: true });
  return <motion.li style={{ opacity, y, filter }}>{children}</motion.li>;
}
