"use client";

import { useStill } from "./useStill";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { springBouncy, springSnappy } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { BillLine } from "@/lib/types";
import { GlowCard } from "./GlowCard";
import { Cutout } from "./visuals";

type Status = "open" | "unmatched" | "settled";
const STATUS_LABEL: Record<Status, string> = { open: "Open", unmatched: "Unmatched", settled: "Settled another way" };

/** Three promises, each with a small working model of itself. */
export function TrustTeaser({ unmatched, priced }: { unmatched: BillLine; priced: BillLine }) {
  return (
    <div className="lp-bento">
      <GlowCard className="lp-cell lp-cell-wide">
        <div className="lp-cell-text">
          <h3>It never accuses anyone</h3>
          <p>
            Ten minutes with nothing paid and a visit is called unmatched, and nothing more. It can still be paid for
            a day, and you can mark it settled if someone left cash. You see unmatched value shelf by shelf.
          </p>
        </div>
        <UnmatchedDemo line={unmatched} />
      </GlowCard>

      <GlowCard className="lp-cell">
        <CountDemo />
        <div className="lp-cell-text">
          <h3>Nobody is identified</h3>
          <p>
            The cameras count items, not people. When several shoppers are in at once, each one claims their own items
            on their phone. A check on the camera keeps only a daily count of visitors.
          </p>
        </div>
      </GlowCard>

      <GlowCard className="lp-cell">
        <PriceDemo line={priced} />
        <div className="lp-cell-text">
          <h3>The server sets every price</h3>
          <p>
            The vision model returns product ids and counts, never a price. Totals are worked out in code, to the cent,
            and an item put back comes off the bill.
          </p>
        </div>
      </GlowCard>
    </div>
  );
}

function UnmatchedDemo({ line }: { line: BillLine }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useStill();
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const [status, setStatus] = useState<Status>("open");

  // The ten-minute wait, played in a moment the first time the row is seen.
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setStatus((s) => (s === "open" ? "unmatched" : s)), reduce ? 0 : 1100);
    return () => clearTimeout(t);
  }, [inView, reduce]);

  const settled = status === "settled";
  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
      };

  return (
    <div ref={ref} className="lp-demo lp-demo-visit">
      <div className="lp-row">
        <span className="lp-row-what">
          <b>
            {line.qty} × {line.name}
          </b>
          <small>Nothing paid yet</small>
        </span>
        <span className="num">${formatCents(line.lineCents)}</span>
        <span className="lp-badge-slot" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={status} className="lp-badge" data-kind={status} {...swap} transition={springSnappy}>
              {STATUS_LABEL[status]}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <div className="lp-demo-actions">
        <button
          type="button"
          className="lp-mini-btn ds-focus"
          disabled={status === "open"}
          onClick={() => setStatus(settled ? "unmatched" : "settled")}
        >
          {settled ? "Undo" : "They left cash: mark as settled"}
        </button>
        <span>Try it. This row is a model, not a real visit.</span>
      </div>
    </div>
  );
}

function CountDemo() {
  return (
    <div className="void lp-demo lp-demo-count" aria-hidden="true">
      <div className="lp-count-shelf">
        {["jam", "honey"].map((sku) => (
          <span key={sku} className="lp-count-item">
            <Cutout sku={sku} />
          </span>
        ))}
      </div>
      <span className="lp-count-chip">2 items</span>
      <svg className="lp-count-hand" viewBox="0 0 120 150" fill="none">
        <path
          d="M38 148V96L20 74c-5-7 4-15 10-9l12 12V26c0-9 13-9 13 0v36-48c0-9 13-9 13 0v48-40c0-9 13-9 13 0v44-28c0-9 13-9 13 0v62c0 14-4 24-9 34v24"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="5 7"
        />
      </svg>
      <span className="lp-count-ignored">Hand: ignored</span>
    </div>
  );
}

function PriceDemo({ line }: { line: BillLine }) {
  const reduce = useStill();
  const [qty, setQty] = useState(line.qty);
  const cents = qty * line.unitCents;

  return (
    <div className="lp-demo lp-demo-price">
      <div className="lp-code">
        <small>From the vision model</small>
        <code>
          {"{ "}
          <span>&quot;sku&quot;</span>: <b>&quot;{line.sku}&quot;</b>, <span>&quot;qty&quot;</span>: <b>{qty}</b>
          {" }"}
        </code>
      </div>
      <div className="lp-priced">
        <small>Priced from your catalogue, ${formatCents(line.unitCents)} each</small>
        <div>
          <span className="lp-stepper">
            <button type="button" className="ds-focus" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
              −
            </button>
            <output className="num" aria-live="polite">
              {qty} × {line.name}
            </output>
            <button type="button" className="ds-focus" aria-label="One more" disabled={qty >= 6} onClick={() => setQty(qty + 1)}>
              +
            </button>
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.b
              key={cents}
              className="num"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.94 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.94 }}
              transition={springBouncy}
            >
              ${formatCents(cents)}
            </motion.b>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
