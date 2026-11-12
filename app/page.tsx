import NextLink from "next/link";
import { VoidHero } from "@/components/VoidHero";
import { Wordmark } from "@/components/Wordmark";
import { Beams } from "@/components/landing/Beams";
import { ChapterRail, type Chapter } from "@/components/landing/ChapterRail";
import { DeviceScene } from "@/components/landing/DeviceScene";
import { OwnerLedger, type LedgerSlice } from "@/components/landing/OwnerLedger";
import { Reveal } from "@/components/landing/Reveal";
import { PayModes } from "@/components/landing/PayModes";
import { StoreTeaser, type StoreItem } from "@/components/landing/StoreTeaser";
import { TrustTeaser } from "@/components/landing/TrustTeaser";
import { demoWeek } from "@/components/inner/seedFigures";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { priceLines } from "@/lib/money";
import type { Totals } from "@/lib/owner";
import { ledgerParts, segmentShares } from "@/lib/owner-view";
import { DEMO_PRODUCTS, exampleVisits } from "@/lib/seed";
import "./landing.css";

const CHAPTERS: Chapter[] = [
  { id: "top", label: "The shelf" },
  { id: "bill", label: "The bill" },
  { id: "how", label: "The store" },
  { id: "pay", label: "Paying" },
  { id: "trust", label: "Trust" },
  { id: "owners", label: "For owners" },
  { id: "go", label: "Try it" },
];

// What the tablet in the pinned scene shows: one visit's worth of shelf, priced from the catalogue.
const SCENE_BILL = priceLines(
  [
    { sku: "jam", qty: 2 },
    { sku: "bread", qty: 1 },
    { sku: "eggs", qty: 1 },
  ],
  DEMO_PRODUCTS,
);

const lineFor = (sku: string, qty: number) => priceLines([{ sku, qty }], DEMO_PRODUCTS).lines[0];
const item = (sku: string): StoreItem => {
  const l = lineFor(sku, 1);
  return { sku: l.sku, name: l.name, unitCents: l.unitCents };
};
const STORE_ITEMS = ["honey", "jam", "bread", "eggs", "apples"].map(item);
const HOLD_BASKET = [
  { ...item("honey"), qty: 1 },
  { ...item("bread"), qty: 1 },
];

/** The demo stand's example week, added up the way the owner's dashboard adds it. */
function exampleLedger(): { slices: LedgerSlice[]; totalCents: number } {
  const rows = exampleVisits("demo", Date.now()).map((v) => ({
    ...v,
    detectedCents: priceLines(v.detected, DEMO_PRODUCTS).totalCents,
  }));
  const totals: Totals = { soldCents: 0, paidCents: 0, refundedCents: 0, unmatchedCents: 0, adjustedCents: 0 };
  for (const r of rows) {
    if (r.status === "empty") continue;
    totals.soldCents += r.detectedCents;
    totals.paidCents += r.paidCents ?? 0;
    totals.refundedCents += r.refundedCents;
    if (r.status === "unmatched") totals.unmatchedCents += r.detectedCents;
    if (r.status === "paid_adjusted") totals.adjustedCents += Math.max(0, r.detectedCents - (r.paidCents ?? 0));
  }
  const { parts, totalCents } = ledgerParts(totals, rows);
  const shares = segmentShares(parts, 3);
  return { slices: parts.map((p, i) => ({ ...p, share: shares[i] })), totalCents };
}

export default async function Home() {
  const ledger = exampleLedger();
  const week = await demoWeek();

  return (
    <>
      <SiteNav />

      <section id="top" data-tone="dark" className="void hero">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <NextLink className="topbar-wide" href="/how-it-works">How it works</NextLink>
            <NextLink className="topbar-wide" href="/owners">For owners</NextLink>
            <NextLink className="topbar-wide" href="/trust">Trust</NextLink>
            <NextLink href="/demo">Demo</NextLink>
            <NextLink href="/owner/login">Owner sign-in</NextLink>
          </nav>
        </header>
        <VoidHero products={DEMO_PRODUCTS} />
      </section>
      <div data-site-nav-after />

      <main className="lp">
        <DeviceScene bill={SCENE_BILL} />

        <section id="how" data-tone="light" className="lp-chapter lp-how" aria-labelledby="how-h">
          <div className="ds-container">
            <Reveal className="lp-how-head">
              <div>
                <h2 id="how-h" className="ds-h1">
                  Any shop, one shelf at a time
                </h2>
                <p className="ds-lead">
                  Shelves grouped by aisle, each with its own camera and its own short list of products. Start with one
                  shelf and add shelves and aisles as you grow. Phones today; webcams and existing CCTV through a small
                  bridge program that sends only the shelf&apos;s part of the picture.
                </p>
              </div>
              <NextLink className="lp-more ds-focus" href="/how-it-works">
                How a visit goes, shelf by shelf
              </NextLink>
            </Reveal>
            <Reveal delay={0.08}>
              <StoreTeaser items={STORE_ITEMS} />
            </Reveal>
          </div>
        </section>

        <section id="pay" data-tone="light" className="lp-chapter lp-paych" aria-labelledby="pay-h">
          <div className="ds-container">
            <Reveal className="lp-how-head">
              <h2 id="pay-h" className="ds-h1">
                Two ways to pay
              </h2>
              <NextLink className="lp-more ds-focus" href="/owners">
                Choosing one for your shop
              </NextLink>
            </Reveal>
            <Reveal delay={0.08}>
              <PayModes basket={HOLD_BASKET} />
            </Reveal>
          </div>
        </section>

        <section id="trust" data-tone="light" className="lp-chapter lp-trust" aria-labelledby="trust-h">
          <div className="ds-container">
            <Reveal className="lp-trust-head">
              <h2 id="trust-h" className="ds-h1">
                It counts jars, not people
              </h2>
              <div>
                <p className="ds-lead">
                  Rules the shop keeps, so an owner and a shopper can both trust the bill. Each one below is a small
                  working model.
                </p>
                <NextLink className="lp-more ds-focus" href="/trust">
                  Everything the shop promises
                </NextLink>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <TrustTeaser unmatched={lineFor("flowers", 1)} priced={lineFor("honey", 2)} />
            </Reveal>
          </div>
        </section>

        <section id="owners" data-tone="dark" className="lp-chapter lp-owners" aria-labelledby="owners-h">
          <div className="ds-container lp-owners-in">
            <Reveal className="lp-owners-copy">
              <h2 id="owners-h" className="ds-h1">
                You weren&apos;t there. You still know.
              </h2>
              <p className="ds-lead">
                What left each shelf, what PayPal captured, and which visits ended with nothing paid. One bar, to the
                cent, and every shelf on its own.
              </p>
              <div className="lp-owners-cta">
                <NextLink className="btn btn-coral" href="/owner">
                  Open the demo dashboard
                </NextLink>
                <span>
                  Passcode: <strong>demo</strong>
                </span>
              </div>
              <NextLink className="lp-more ds-focus" href="/owners">
                What an owner gets
              </NextLink>
            </Reveal>
            <figure className="lp-owners-fig">
              <OwnerLedger slices={ledger.slices} totalCents={ledger.totalCents} />
              <ul className="lp-owner-shelves" aria-label="Unmatched by shelf">
                {week.shelves.map((sh) => (
                  <li key={sh.name} data-look={sh.look || undefined}>
                    <span>{sh.aisle}</span>
                    <strong>{sh.name}</strong>
                    <span className="num">Taken {sh.taken}</span>
                    <span className="num lp-owner-un">Unmatched {sh.unmatched}</span>
                  </li>
                ))}
              </ul>
              <figcaption>
                An example week from the demo shop, not real sales. The shelf split is an example layout of its products.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="go" data-tone="dark" className="void lp-chapter lp-go" aria-labelledby="go-h">
          <Beams />
          <div className="ds-container lp-go-in">
            <Reveal>
              <h2 id="go-h" className="ds-h1">
                Any shop can be a walk-out shop
              </h2>
            </Reveal>
            <Reveal delay={0.06} className="lp-go-actions">
              <NextLink className="btn btn-coral" href="/demo/store">
                Watch a whole store run
              </NextLink>
              <NextLink className="btn btn-ghost" href="/demo">
                Run your own
              </NextLink>
            </Reveal>
            <Reveal delay={0.1}>
              <NextLink className="lp-go-link ds-focus" href="/owner/login">
                Or open the example dashboard (passcode demo)
              </NextLink>
            </Reveal>
          </div>
        </section>
      </main>

      <ChapterRail chapters={CHAPTERS} />
      <SiteFooter />
    </>
  );
}
