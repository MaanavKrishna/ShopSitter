"use client";

import { IconArrowUpRight } from "@tabler/icons-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import { useOwner } from "./OwnerProvider";

// The stand screen is camera 1; a stand can have up to three more.
const EXTRA_CAMERAS = [2, 3, 4];

/** A QR code a second phone can scan to open one of the stand's pages. Drawn in the browser, which knows the address. */
function PageCode({ path, label }: { path: string; label: string }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(`${window.location.origin}${path}`, {
      margin: 1,
      width: 264,
      color: { dark: "#0a1024", light: "#ffffff" },
    }).then((url) => {
      if (live) setCode(url);
    });
    return () => {
      live = false;
    };
  }, [path]);

  return (
    <span className="ow-qr">
      {/* A data URL made on the spot: there is nothing for the image optimiser to do. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {code && <img src={code} alt={label} width={132} height={132} />}
    </span>
  );
}

/** What the owner needs to run the stand: the stand screen, extra cameras, and the catalogue as it stands. */
export function SetupView() {
  const { data } = useOwner();
  const { products } = data;

  return (
    <div className="ow-setup">
      <section className="ow-panel ow-setup-stand" aria-labelledby="stand-h">
        <div>
          <h2 id="stand-h">Stand screen</h2>
          <p>
            Open it on the device that faces the shelf and prop it so its camera sees every product. It shows the bill
            and the PayPal code as things leave the shelf.
          </p>
          <p className="ow-setup-note">
            The screen asks for the stand&apos;s 6-digit code before it starts. Keep that code to yourself: anyone who
            has it can run a stand screen for this stand.
          </p>
        </div>
        <a href="/stand" target="_blank" rel="noreferrer" className="ow-cta ds-press">
          Open stand screen
          <IconArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>

      <section className="ow-panel" aria-labelledby="cams-h">
        <div className="ow-panel-head">
          <h2 id="cams-h">Extra cameras</h2>
          <p className="ow-panel-meta">Up to three more views of the shelf</p>
        </div>
        <p className="ow-setup-lead">
          Scan a code with another phone to open that camera there, or open it on this device. Each one asks for the
          same 6-digit stand code.
        </p>
        <ul className="ow-cams">
          {EXTRA_CAMERAS.map((n) => (
            <li key={n}>
              <PageCode path={`/stand/camera/${n}`} label={`QR code that opens camera ${n}`} />
              <b>Camera {n}</b>
              <a href={`/stand/camera/${n}`} target="_blank" rel="noreferrer" className="ow-inline-link">
                Open here
                <IconArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="ow-panel" aria-labelledby="products-h">
        <div className="ow-panel-head">
          <h2 id="products-h">Products</h2>
          <p className="ow-panel-meta">{products.length} on this stand</p>
        </div>
        {products.length === 0 ? (
          <div className="ow-empty">
            <b>No products yet</b>
            <p>Products appear here once the stand has some.</p>
          </div>
        ) : (
          <ul className="ow-rows">
            {products.map((p) => (
              <li key={p.sku} className="ow-row ow-product-row">
                <span className="ow-row-main">
                  {p.name}
                  {p.description && <small>{p.description}</small>}
                </span>
                <span className="ow-row-when">Starts at {p.stock}</span>
                <span className="ow-row-money num">${formatCents(p.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
