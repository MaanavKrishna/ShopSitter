"use client";

import { useState } from "react";
import { AnimatePresence, Reorder, motion, useReducedMotion } from "motion/react";
import { spring, springSnappy } from "@/lib/motion";
import { StatusBadge } from "./bits";

/** One unmatched visit, and the button that settles it. */
export function SettleDemo({ what, amount }: { what: string; amount: string }) {
  const [settled, setSettled] = useState(false);
  const reduce = useReducedMotion();
  return (
    <div className="in-spec in-settle">
      <div className="in-settle-row">
        <span>{what}</span>
        <span className="num">{amount}</span>
        <span className="in-status-badge" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={String(settled)}
              initial={reduce ? { opacity: 0 } : { opacity: 0, rotateX: -80, y: 6 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, rotateX: 0, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotateX: 80, y: -6 }}
              transition={springSnappy}
            >
              {settled ? (
                <StatusBadge tone="settled">Settled another way</StatusBadge>
              ) : (
                <StatusBadge tone="unmatched">Unmatched</StatusBadge>
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <button type="button" className="in-spec-btn ds-focus" onClick={() => setSettled((s) => !s)}>
        {settled ? "Undo" : "Settled another way"}
      </button>
    </div>
  );
}

/** What is left of each product, as the dashboard's shelf list shows it. */
export function StockBars({ stock }: { stock: { sku: string; name: string; left: number; of: number }[] }) {
  return (
    <ul className="in-spec in-stock">
      {stock.map((s) => (
        <li key={s.sku}>
          <span>{s.name}</span>
          <span className="in-stock-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${s.of > 0 ? s.left / s.of : 0})` }} />
          </span>
          <span className="num">
            {s.left} of {s.of}
          </span>
        </li>
      ))}
    </ul>
  );
}

const TILES = [
  { id: "by-day", label: "By day" },
  { id: "by-product", label: "What sells" },
  { id: "visits", label: "How visits ended" },
];

function Sketch({ id }: { id: string }) {
  if (id === "by-day") {
    return (
      <svg viewBox="0 0 64 36" aria-hidden="true">
        {[14, 22, 9, 30, 18, 26, 34].map((h, i) => (
          <rect key={i} x={2 + i * 9} y={36 - h} width="6" height={h} rx="1.5" />
        ))}
      </svg>
    );
  }
  if (id === "by-product") {
    return (
      <svg viewBox="0 0 64 36" aria-hidden="true">
        {[56, 44, 38, 24].map((w, i) => (
          <rect key={i} x="2" y={2 + i * 9} width={w} height="5" rx="1.5" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 36" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="2" y={3 + i * 9} width="34" height="3" rx="1.5" />
          <rect x="48" y={3 + i * 9} width="14" height="3" rx="1.5" opacity="0.45" />
        </g>
      ))}
    </svg>
  );
}

/** Three chart tiles that can be dragged into a new order, as the dashboard's charts can. */
export function ChartTiles() {
  const [order, setOrder] = useState(TILES);
  return (
    <div className="in-spec">
      <Reorder.Group axis="x" values={order} onReorder={setOrder} className="in-tiles" aria-label="A model of the charts. Drag one to move it.">
        {order.map((t) => (
          <Reorder.Item
            key={t.id}
            value={t}
            className="in-tile"
            whileDrag={{ scale: 1.04, boxShadow: "0 16px 28px -14px rgb(10 16 36 / 0.4)" }}
            transition={spring}
          >
            <Sketch id={t.id} />
            <span>{t.label}</span>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <p className="in-spec-hint">Drag a tile to move it.</p>
    </div>
  );
}
