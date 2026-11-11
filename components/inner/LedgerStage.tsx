"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { STAGGER, easeOut, spring } from "@/lib/motion";
import { StatusBadge, usd } from "./bits";
import type { DemoWeek } from "./seedFigures";

type Props = Pick<DemoWeek, "parts" | "totalCents" | "visitCount" | "days"> & { rows: DemoWeek["rows"] };

/**
 * The dashboard's shelf ledger at reading size: one bar showing where the value taken from the
 * shelf went, the amounts under it and the latest visits. A soft light follows the pointer.
 */
export function LedgerStage({ parts, totalCents, visitCount, days, rows }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.3 });
  // Held back only once scripts are running, so the server-rendered ledger is complete on its own.
  const [armed, setArmed] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [lit, setLit] = useState(false);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set once, before first paint
    if (!reduce) setArmed(true);
  }, [reduce]);

  const shown = !armed || inView;

  useEffect(() => {
    const el = figure.current;
    if (!el || !armed || !inView) return;
    const run = animate(0, totalCents, {
      duration: 1.1,
      ease: easeOut,
      onUpdate: (v) => (el.textContent = usd(Math.round(v))),
    });
    return () => run.stop();
  }, [armed, inView, totalCents]);

  const follow = { stiffness: 220, damping: 30 };
  const x = useSpring(useMotionValue(0), follow);
  const y = useSpring(useMotionValue(0), follow);
  const glow = useMotionTemplate`radial-gradient(520px circle at ${x}px ${y}px, rgb(33 82 242 / 0.34), transparent 68%)`;
  const edge = useMotionTemplate`radial-gradient(360px circle at ${x}px ${y}px, rgb(201 213 255 / 0.9), transparent 70%)`;

  const summary = `Of ${usd(totalCents)} taken from the shelf: ${parts.map((p) => `${p.label.toLowerCase()} ${usd(p.cents)}`).join(", ")}.`;

  return (
    <div
      ref={ref}
      className="in-ledger"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const box = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - box.left);
        y.set(e.clientY - box.top);
        setLit(true);
      }}
      onPointerLeave={() => setLit(false)}
    >
      <motion.span className="in-ledger-glow" aria-hidden="true" style={{ background: glow, opacity: lit ? 1 : 0 }} />
      <motion.span className="in-ledger-edge" aria-hidden="true" style={{ background: edge, opacity: lit ? 1 : 0 }} />

      <div className="in-ledger-top">
        <span>Demo stand</span>
        <span>
          Last {days} days, {visitCount} visits
        </span>
      </div>

      <p className="in-ledger-figure">
        <span ref={figure} className="num">
          {usd(totalCents)}
        </span>
        <span>taken from the shelf</span>
      </p>

      <motion.div
        className="in-ledger-bar"
        role="img"
        aria-label={summary}
        initial={false}
        animate={{ clipPath: shown ? "inset(0 0% 0 0 round 8px)" : "inset(0 100% 0 0 round 8px)" }}
        transition={{ ...spring, duration: 0.9 }}
      >
        {parts.map((p) => (
          <span
            key={p.key}
            data-part={p.key}
            data-dim={(focus !== null && focus !== p.key) || undefined}
            style={{ flexGrow: p.share }}
          />
        ))}
      </motion.div>

      <dl className="in-ledger-legend">
        {parts.map((p, i) => (
          <motion.div
            key={p.key}
            onPointerEnter={(e) => e.pointerType === "mouse" && setFocus(p.key)}
            onPointerLeave={() => setFocus(null)}
            data-dim={(focus !== null && focus !== p.key) || undefined}
            initial={false}
            animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ ...spring, delay: shown && armed ? 0.25 + i * STAGGER : 0 }}
          >
            <dt>
              <i data-part={p.key} aria-hidden="true" />
              {p.label}
            </dt>
            <dd className="num">{usd(p.cents)}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="in-ledger-rows">
        <table>
          <caption className="sr-only">The latest visits at the demo stand</caption>
          <thead>
            <tr>
              <th scope="col">Taken</th>
              <th scope="col">Status</th>
              <th scope="col" className="in-ledger-wide">
                Worth
              </th>
              <th scope="col">Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.what}</td>
                <td>
                  <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
                </td>
                <td className="num in-ledger-wide">{r.detected}</td>
                <td className="num">{r.paid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
