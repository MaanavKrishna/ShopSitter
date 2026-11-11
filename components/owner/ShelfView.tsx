"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { formatCents } from "@/lib/money";
import { easeOut, spring } from "@/lib/motion";
import { isLow, takenBySku } from "@/lib/owner-view";
import { useOwner } from "./OwnerProvider";

/** Every product on the stand: how full its place on the shelf is, its price, and how many left in the period. */
export function ShelfView() {
  const { data, period, switching } = useOwner();
  const { stock, products, visits } = data;

  // Lowest first, so what needs restocking is at the top.
  const shelf = useMemo(() => {
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const taken = takenBySku(visits);
    return stock
      .map((s) => {
        const product = bySku.get(s.sku);
        return {
          ...s,
          starting: Math.max(product?.stock ?? 0, s.left),
          priceCents: product?.priceCents ?? null,
          taken: taken[s.sku] ?? 0,
          low: isLow(s.left),
        };
      })
      .sort((a, b) => Number(b.low) - Number(a.low));
  }, [stock, products, visits]);

  const low = shelf.filter((s) => s.low).length;

  return (
    <section className="ow-panel ow-shelf" aria-labelledby="shelf-h">
      <div className="ow-panel-head">
        <h2 id="shelf-h">On the shelf</h2>
        <p className="ow-panel-meta">
          {shelf.length} {shelf.length === 1 ? "product" : "products"}
          {low > 0 && (
            <>
              {" · "}
              <b className="ow-coral">{low} to restock</b>
            </>
          )}
        </p>
      </div>
      {shelf.length === 0 ? (
        <div className="ow-empty ow-empty-tall">
          <b>No products yet</b>
          <p>Products appear here once the stand has some.</p>
        </div>
      ) : (
        <>
          <div className="ow-shelf-cols" aria-hidden="true">
            <span>Product</span>
            <span>Level</span>
            <span data-end>Left</span>
            <span data-end>Price</span>
            <span data-end>Taken, {period.span}</span>
          </div>
          <ul className="ow-shelf-list">
            {shelf.map((s) => (
              <motion.li key={s.sku} layout="position" transition={spring} data-low={s.low || undefined}>
                <span className="ow-shelf-name">
                  {s.name}
                  {s.low && <span className="ow-restock">Restock</span>}
                </span>
                <span className="ow-level" aria-hidden="true">
                  <motion.span
                    initial={{ clipPath: "inset(0 100% 0 0 round 3px)" }}
                    whileInView={{
                      clipPath: `inset(0 ${100 - (s.starting > 0 ? (s.left / s.starting) * 100 : 0)}% 0 0 round 3px)`,
                    }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: easeOut }}
                  />
                </span>
                <span className="ow-shelf-left" data-end>
                  <span className="num">{s.left}</span> of {s.starting}
                </span>
                <span className="ow-shelf-fact" data-end>
                  <span className="ow-shelf-label">Price</span>
                  <span className="num">{s.priceCents === null ? "—" : `$${formatCents(s.priceCents)}`}</span>
                </span>
                <span className="ow-shelf-fact" data-end data-stale={switching || undefined}>
                  <span className="ow-shelf-label">Taken, {period.span}</span>
                  <span className="num">{s.taken}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
