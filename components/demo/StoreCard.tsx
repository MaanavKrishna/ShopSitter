import { IconArrowRight, IconCamera, IconDeviceMobile, IconReceipt } from "@tabler/icons-react";
import NextLink from "next/link";

const PANES = [
  { icon: IconCamera, title: "Shelf cameras", text: "Two shelves, read by the vision model" },
  { icon: IconDeviceMobile, title: "Shopper's phone", text: "The basket fills as you take things" },
  { icon: IconReceipt, title: "Owner's ledger", text: "Every visit, priced by the server" },
] as const;

/** The way into the store simulator: the whole system, side by side, without a shelf or a phone. */
export function StoreCard() {
  return (
    <section className="dm-store void" aria-labelledby="dm-store-h">
      <div className="dm-store-text">
        <h2 id="dm-store-h">Watch a whole store run, live</h2>
        <p>
          One click sets up a real sample store. You play the shopper, and see the shelf cameras, your phone&apos;s
          basket and the owner&apos;s ledger move together. Sample shelf pictures stand in for the cameras; everything
          else is the real system.
        </p>
        <NextLink href="/demo/store" className="dm-store-go ds-press ds-focus">
          Open the store simulator
          <IconArrowRight size={18} stroke={2} aria-hidden="true" />
        </NextLink>
      </div>
      <ol className="dm-store-panes" aria-label="What you will see">
        {PANES.map((p) => (
          <li key={p.title}>
            <p.icon size={20} stroke={1.75} aria-hidden="true" />
            <b>{p.title}</b>
            <span>{p.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
