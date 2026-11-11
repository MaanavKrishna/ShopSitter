"use client";

import { IconArrowRight, IconArrowUpRight } from "@tabler/icons-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
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

/** What the owner needs to run the stand: the stand screen, extra cameras, and the way to the products. */
export function SetupView() {
  const { data, shop } = useOwner();
  // The demo stand's products cannot be changed, so its link only offers a look.
  const fixed = shop === "demo";
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

      <section className="ow-panel ow-setup-products" aria-labelledby="products-h">
        <div>
          <h2 id="products-h">Products</h2>
          <p>
            {products.length === 0
              ? "This stand has no products yet. Add the first one with a name, a price and a photo."
              : `${products.length} ${products.length === 1 ? "product" : "products"} on this stand. ${
                  fixed
                    ? "The demo stand's products are fixed."
                    : "Change names, prices, photos and how many the shelf holds."
                }`}
          </p>
        </div>
        <Link href="/owner/products" className="ow-rowbtn ds-press">
          {fixed ? "See products" : products.length === 0 ? "Add a product" : "Edit products"}
          <IconArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
