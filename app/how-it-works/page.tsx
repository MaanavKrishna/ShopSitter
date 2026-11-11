import type { Metadata } from "next";
import NextLink from "next/link";
import { HowTimeline } from "@/components/inner/HowTimeline";
import { Reveal } from "@/components/inner/Reveal";
import { catalogue, demoWeek } from "@/components/inner/seedFigures";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { LATE_PAY_MS, OPEN_TIMEOUT_MS } from "@/lib/visits";
import "../inner.css";

export const metadata: Metadata = {
  title: "How a visit goes",
  description:
    "From a hand reaching for a jar to the owner seeing it was paid: how Shopsitter notices a shelf change, reads it, writes the bill and takes payment with PayPal.",
};

const PARTS = [
  {
    name: "PayPal",
    does: "Turns each bill into an itemised order, takes the payment and sends refunds.",
    note: "Sandbox only",
  },
  {
    name: "A vision model",
    does: "Compares the before and after photos and returns product ids and counts. It never sees a price.",
    note: "Counts, not prices",
  },
  {
    name: "AG Studio",
    does: "Draws the owner’s sales charts and tables, which they can rearrange.",
    note: "Owner’s dashboard",
  },
];

const LIMITS = [
  ["It is a prototype", "Built for the PayPal AI Hackathon 2026. It is not a finished product."],
  ["One shelf", "One stand, one shelf in view. Extra cameras help with hidden items, not with more shelves."],
  ["A handful of products", "About six, and they need to look different from each other."],
  ["Good light", "A dim or flickering shelf is read less well, and sometimes not at all."],
  ["It can miscount", "Which is why the shopper can always fix the bill, and the owner sees that it was adjusted."],
  ["PayPal sandbox", "Payments run in PayPal’s test environment. No real money moves."],
];

export default async function HowItWorks() {
  const week = await demoWeek();
  const rows = week.rows.slice(0, 5).map(({ id, what, tone, status, amount }) => ({ id, what, tone, status, amount }));

  return (
    <>
      <SiteNav tone="onLight" />
      <main className="in in-how">
        <header className="in-hero in-hero-light">
          <div className="ds-container">
            <h1 className="in-h1">How a visit goes</h1>
            <div className="in-hero-foot">
              <p className="ds-lead">
                Nobody is standing at the stand. This is everything that happens between a hand reaching for a jar and
                the owner seeing it was paid for.
              </p>
              <dl className="in-hero-facts">
                <div>
                  <dt>Steps for the shopper</dt>
                  <dd className="num">Take, scan, pay</dd>
                </div>
                <div>
                  <dt>Time to pay at the stand</dt>
                  <dd className="num">{OPEN_TIMEOUT_MS / 60_000} minutes</dd>
                </div>
                <div>
                  <dt>Time to pay late</dt>
                  <dd className="num">{LATE_PAY_MS / 3_600_000} hours</dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <section className="in-timeline" aria-label="The steps of a visit">
          <div className="ds-container">
            <HowTimeline items={catalogue()} rows={rows} />
          </div>
        </section>

        <section className="in-band in-band-tint" aria-labelledby="parts-h">
          <div className="ds-container in-split">
            <Reveal>
              <h2 id="parts-h" className="ds-h2">
                What does the work
              </h2>
              <p className="in-sub">Three things Shopsitter leans on, and what each one is trusted with.</p>
            </Reveal>
            <Reveal delay={0.06}>
              <ul className="in-list">
                {PARTS.map((p) => (
                  <li key={p.name}>
                    <span className="in-list-name">{p.name}</span>
                    <span className="in-list-does">{p.does}</span>
                    <span className="in-list-note">{p.note}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="in-band" aria-labelledby="limits-h">
          <div className="ds-container in-split">
            <Reveal>
              <h2 id="limits-h" className="ds-h2">
                Where it stops
              </h2>
              <p className="in-sub">What it cannot do yet, said plainly.</p>
            </Reveal>
            <Reveal delay={0.06}>
              <dl className="in-limits">
                {LIMITS.map(([term, text]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        <section className="void in-close" aria-labelledby="close-h">
          <div className="ds-container">
            <h2 id="close-h" className="ds-h2">
              See a visit happen
            </h2>
            <p className="ds-lead">The demo runs a visit without a camera, and the bill is paid in the PayPal sandbox.</p>
            <div className="in-close-actions">
              <NextLink href="/demo" className="in-btn in-btn-coral ds-focus">
                Try the demo
              </NextLink>
              <NextLink href="/trust" className="in-btn in-btn-ghost ds-focus">
                What it keeps, and what it does not
              </NextLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
