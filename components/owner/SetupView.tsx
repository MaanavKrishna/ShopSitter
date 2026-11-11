"use client";

import { IconArrowRight, IconArrowUpRight, IconCopy } from "@tabler/icons-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useOwner } from "./OwnerProvider";

// The stand screen is camera 1; a stand can have up to three more.
const EXTRA_CAMERAS = [2, 3, 4];

/** A QR code a second phone can scan to open one of the stand's pages. Drawn in the browser, which knows the address. */
export function PageCode({ path, label }: { path: string; label: string }) {
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
  const { data, shop, kind, trialStand } = useOwner();
  const trial = kind === "trial";
  const [copied, setCopied] = useState(false);
  // A trial's devices open from links that carry its key after the "#"; the others type their code.
  const keyPart = trial && trialStand ? `#key=${trialStand.key}` : "";
  const cameraPath = (n: number) => `/stand/camera/${n}${keyPart}`;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  // The demo stand's products cannot be changed, so its link only offers a look.
  const fixed = shop === "demo";
  const { products } = data;

  return (
    <div className="ow-setup">
      {trial ? (
        <section className="ow-panel ow-setup-stand ow-setup-trial" aria-labelledby="stand-h">
          {trialStand ? (
            <PageCode path={trialStand.standLink} label="QR code that opens your stand screen" />
          ) : (
            <span className="ow-qr" aria-hidden="true" />
          )}
          <div>
            <h2 id="stand-h">Stand screen</h2>
            <p>
              Scan the code with the phone you&apos;ll prop by the shelf, or open it on this device. It shows the bill
              and the PayPal code as things leave the shelf.
            </p>
            <p className="ow-setup-note">
              The link already holds this trial&apos;s key, so there is nothing to type. Anyone who has it can run a
              stand screen for this trial until it ends, so keep it to yourself.
            </p>
            <div className="ow-go-actions">
              <a
                href={trialStand?.standLink}
                target="_blank"
                rel="noreferrer"
                className="ow-cta ds-press"
                aria-disabled={!trialStand || undefined}
              >
                Use this device
                <IconArrowUpRight size={17} aria-hidden="true" />
              </a>
              <button
                type="button"
                className="ow-rowbtn ds-press"
                disabled={!trialStand}
                onClick={() => {
                  if (!trialStand) return;
                  void navigator.clipboard
                    .writeText(`${window.location.origin}${trialStand.standLink}`)
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
              >
                <IconCopy size={14} stroke={1.75} aria-hidden="true" />
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </section>
      ) : (
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
      )}

      <section className="ow-panel" aria-labelledby="cams-h">
        <div className="ow-panel-head">
          <h2 id="cams-h">Extra cameras</h2>
          <p className="ow-panel-meta">Up to three more views of the shelf</p>
        </div>
        <p className="ow-setup-lead">
          {trial
            ? "Scan a code with another phone to open that camera there, or open it on this device. Each link holds this trial's key, so there is nothing to type."
            : "Scan a code with another phone to open that camera there, or open it on this device. Each one asks for the same 6-digit stand code."}
        </p>
        <ul className="ow-cams">
          {EXTRA_CAMERAS.map((n) => (
            <li key={n}>
              {trial && !trialStand ? (
                <span className="ow-qr" aria-hidden="true" />
              ) : (
                <PageCode path={cameraPath(n)} label={`QR code that opens camera ${n}`} />
              )}
              <b>Camera {n}</b>
              <a href={cameraPath(n)} target="_blank" rel="noreferrer" className="ow-inline-link">
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
