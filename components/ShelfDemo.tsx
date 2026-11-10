"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCents, priceLines } from "@/lib/money";
import type { Product } from "@/lib/types";
import { ProductArt } from "./ProductArt";
import { Starburst } from "./Starburst";

const CARD_COLOURS = ["card-yellow", "card-orange", "card-pink", "card-lime", "card-yellow", "card-orange"];
const START_STOCK = 4;

/**
 * A toy stand for the home page: tap a crate to take an item and the bill writes itself.
 * It runs in the browser only; the real stand does this with a camera.
 */
export function ShelfDemo({ products }: { products: Product[] }) {
  const [taken, setTaken] = useState<Record<string, number>>({});
  const [bump, setBump] = useState(0);

  const bill = priceLines(
    Object.entries(taken).map(([sku, qty]) => ({ sku, qty })),
    products,
  );

  const change = (sku: string, by: number) => {
    setTaken((t) => ({ ...t, [sku]: Math.max(0, Math.min(START_STOCK, (t[sku] ?? 0) + by)) }));
    setBump((n) => n + 1);
  };

  return (
    <>
      <div className="hero-top">
        <div className="hero-sign card">
          <h1>The stand that rings you up</h1>
          <p>
            Take what you like from the shelf. A phone camera counts it, your bill appears, and you pay with PayPal.
            Nobody has to be there.
          </p>
        </div>

        <aside className="bill card card-white" aria-live="polite" aria-label="Your bill">
          <h2>Your bill</h2>
          {bill.lines.length === 0 ? (
            <p className="bill-hint">Take something from the shelf below and watch this fill in.</p>
          ) : (
            <>
              <ul>
                {bill.lines.map((l) => (
                  <li key={l.sku}>
                    <span>
                      {l.qty} × {l.name}
                    </span>
                    <span className="money">${formatCents(l.lineCents)}</span>
                    <button type="button" className="bill-back" onClick={() => change(l.sku, -1)}>
                      Put back<span className="sr-only"> one {l.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="bill-total">
                <p>On the real stand you scan a code here and pay with PayPal.</p>
                <div className="flash bump" key={bump}>
                  <Starburst />
                  <span className="money">${formatCents(bill.totalCents)}</span>
                </div>
              </div>
            </>
          )}
          <Link className="btn" href="/demo">
            Try it with real shelf photos
          </Link>
        </aside>
      </div>

      <div className="shelf" role="group" aria-label="The shelf">
        {products.map((p, i) => {
          const left = START_STOCK - (taken[p.sku] ?? 0);
          return (
            <button key={p.sku} type="button" className="crate" disabled={left === 0} onClick={() => change(p.sku, 1)}>
              <ProductArt sku={p.sku} />
              <span className={`price-card card ${CARD_COLOURS[i % CARD_COLOURS.length]}`}>
                <span className="price-name">{p.name}</span>
                <span className="marker">${formatCents(p.priceCents).replace(/\.00$/, "")}</span>
              </span>
              <span className="crate-take">{left === 0 ? "All gone" : "Take one"}</span>
              <span className="crate-left">{left} left</span>
            </button>
          );
        })}
      </div>

      <p className="hero-note">
        This shelf is a toy, so you can try the idea in a click. The real stand is a phone camera reading a real shelf.{" "}
        <Link href="/demo">See it read real photos.</Link>
      </p>
    </>
  );
}
