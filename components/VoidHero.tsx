"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatCents, priceLines } from "@/lib/money";
import type { Product } from "@/lib/types";
import { HERO_PLACES, PRODUCT_PHOTOS } from "./products";

const MAX_EACH = 4;
const price = (cents: number) => `$${formatCents(cents).replace(/\.00$/, "")}`;

/**
 * The home page's first screen: the stand's products float in the studio, and taking one
 * adds it to the bill. It starts with two things already taken, the way a visit looks mid-way.
 * This is a toy that runs in the browser; the real stand does it with a camera.
 */
export function VoidHero({ products }: { products: Product[] }) {
  const [taken, setTaken] = useState<Record<string, number>>({ honey: 1, bread: 1 });

  const bill = priceLines(
    Object.entries(taken).map(([sku, qty]) => ({ sku, qty })),
    products,
  );
  const change = (sku: string, by: number) =>
    setTaken((t) => ({ ...t, [sku]: Math.max(0, Math.min(MAX_EACH, (t[sku] ?? 0) + by)) }));

  return (
    <div className="void-stage">
      <div className="void-copy">
        <h1>The stand that rings you up</h1>
        <p>Take what you like. A camera counts it, your bill appears, you pay with PayPal.</p>
        <Link className="btn btn-coral" href="/demo">
          Try it with real shelf photos
        </Link>
      </div>

      <ul className="void-items" aria-label="The shelf. Take something to add it to the bill.">
        {products.map((p) => {
          const photo = PRODUCT_PHOTOS[p.sku];
          const place = HERO_PLACES[p.sku];
          if (!photo || !place) return null;
          const qty = taken[p.sku] ?? 0;
          return (
            <li
              key={p.sku}
              style={
                {
                  "--x": `${place.x}%`,
                  "--y": `${place.y}%`,
                  "--w": `${place.w}%`,
                  "--tilt": `${place.tilt}deg`,
                  "--delay": `${place.delay}s`,
                } as React.CSSProperties
              }
            >
              <button
                type="button"
                className="void-item"
                data-taken={qty > 0}
                data-label={place.label}
                disabled={qty >= MAX_EACH}
                onClick={() => change(p.sku, 1)}
                aria-label={`Take one ${p.name}, ${price(p.priceCents)}${qty ? `. ${qty} on your bill` : ""}`}
              >
                <Image src={photo.src} width={photo.width} height={photo.height} alt="" priority />
                <span className="chip">
                  {p.name}
                  <b>{price(p.priceCents)}</b>
                  {qty > 0 && <i>×{qty}</i>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <aside className="glass bill" aria-live="polite" aria-label="Your bill">
        <h2>Your bill</h2>
        {bill.lines.length === 0 ? (
          <p className="bill-hint">Take something from the shelf and it lands here.</p>
        ) : (
          <ul>
            {bill.lines.map((l) => (
              <li key={l.sku}>
                <span>
                  {l.qty} × {l.name}
                </span>
                <span className="num">${formatCents(l.lineCents)}</span>
                <button type="button" onClick={() => change(l.sku, -1)} aria-label={`Put back one ${l.name}`}>
                  −
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="bill-total">
          <span>Total</span>
          <span className="num" key={bill.totalCents}>
            ${formatCents(bill.totalCents)}
          </span>
        </p>
        <Link className="btn btn-paypal" href="/demo">
          See it pay with PayPal
        </Link>
      </aside>

      <p className="void-note">
        This shelf is a toy so you can try the idea. The real stand is a phone camera reading a real shelf.
      </p>
    </div>
  );
}
