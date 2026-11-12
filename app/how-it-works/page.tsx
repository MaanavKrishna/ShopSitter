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
  title: "How it works",
  description:
    "Walk-out checkout for a small shop: how each shelf's camera notices a change, how the item lands in the right basket, how a PayPal hold charges only for what was taken, and what the owner sees per shelf.",
};

const PARTS = [
  {
    name: "PayPal",
    does: "Turns each bill into an itemised order, holds an amount when the owner asks for it, captures only what was taken, releases the rest and sends refunds.",
    note: "Sandbox only",
  },
  {
    name: "A vision model",
    does: "Compares one shelf’s before and after photos, choosing only among that shelf’s products, and returns ids and counts. It never sees a price.",
    note: "Counts, not prices",
  },
  {
    name: "The shelf’s camera",
    does: "Notices the shelf changed and went still, and holds the read while a hand is in view. Nothing about a person is stored or sent.",
    note: "Phones today",
  },
  {
    name: "AG Studio",
    does: "Draws the owner’s sales charts and tables, which they can rearrange.",
    note: "Owner’s dashboard",
  },
];

const LIMITS = [
  ["It is a prototype", "Built for the PayPal AI Hackathon 2026. It is not a finished product."],
  ["A small shop, not a supermarket", "Phones as cameras suit a shop of a few aisles, one camera per shelf."],
  ["Products that look different", "Items on the same shelf should be easy to tell apart, and the light should be reasonable."],
  ["Measured on composed pictures", "15 of 15 reads were right on seven composed sample pairs. Composed pictures are easier than real photos, so this shows the reader works, not how often it is right in a real shop."],
  ["It can miscount", "Which is why the shopper can always fix the bill, and the owner sees that it was adjusted."],
  ["Several shoppers rely on claims", "When more than one shopper is checked in, each item waits for someone to say it is theirs."],
  ["Rate limits per server", "Limits are counted on each server instance, so real ceilings are higher than configured."],
  ["PayPal sandbox", "Payments and holds run in PayPal’s test environment. No real money moves."],
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
            <h1 className="in-h1">How a shop runs itself</h1>
            <div className="in-hero-foot">
              <p className="ds-lead">
                Nobody is behind the counter. Each shelf has its own camera. This is everything between the owner
                setting up a shelf and seeing, shelf by shelf, what was taken and what was paid.
              </p>
              <dl className="in-hero-facts">
                <div>
                  <dt>Steps for the shopper</dt>
                  <dd className="num">Take, check, pay</dd>
                </div>
                <div>
                  <dt>Before a visit is unmatched</dt>
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

        <section className="in-timeline" aria-label="The steps of a store visit">
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
              <p className="in-sub">Four things Shopsitter leans on, and what each one is trusted with.</p>
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
              See a shop run without you
            </h2>
            <p className="ds-lead">
              Watch a simulated store with several shoppers, or start a private trial with your own products and a
              camera. Either way the bill is paid in the PayPal sandbox.
            </p>
            <div className="in-close-actions">
              <NextLink href="/demo/store" className="in-btn in-btn-coral ds-focus">
                Watch a whole store run
              </NextLink>
              <NextLink href="/demo" className="in-btn in-btn-ghost ds-focus">
                Run your own
              </NextLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
