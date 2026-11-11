import NextLink from "next/link";
import { VoidHero } from "@/components/VoidHero";
import { Wordmark } from "@/components/Wordmark";
import { Beams } from "@/components/landing/Beams";
import { ChapterRail, type Chapter } from "@/components/landing/ChapterRail";
import { DeviceScene } from "@/components/landing/DeviceScene";
import { OwnerLedger, type LedgerSlice } from "@/components/landing/OwnerLedger";
import { Reveal } from "@/components/landing/Reveal";
import { TrustTeaser } from "@/components/landing/TrustTeaser";
import { VisitTeaser } from "@/components/landing/VisitTeaser";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { priceLines } from "@/lib/money";
import type { Totals } from "@/lib/owner";
import { ledgerParts, segmentShares } from "@/lib/owner-view";
import { DEMO_PRODUCTS, exampleVisits } from "@/lib/seed";
import "./landing.css";

const CHAPTERS: Chapter[] = [
  { id: "top", label: "The stand" },
  { id: "bill", label: "The bill" },
  { id: "how", label: "A visit" },
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

export default function Home() {
  const ledger = exampleLedger();

  return (
    <>
      <SiteNav />
      <ChapterRail chapters={CHAPTERS} />

      <section id="top" data-tone="dark" className="void hero">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <NextLink href="/demo">Try the demo</NextLink>
            <NextLink href="/owner">Owner&apos;s view</NextLink>
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
              <h2 id="how-h" className="ds-h2">
                A visit takes four beats
              </h2>
              <NextLink className="lp-more ds-focus" href="/how-it-works">
                How a visit goes, step by step
              </NextLink>
            </Reveal>
            <Reveal delay={0.08}>
              <VisitTeaser
                line={lineFor("honey", 1)}
                past={[
                  { line: lineFor("apples", 2), kind: "paid", when: "Earlier today" },
                  { line: lineFor("flowers", 1), kind: "unmatched", when: "Yesterday" },
                ]}
              />
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
                  Rules the stand keeps, so an owner and a customer can both trust the bill. Each one below is a small
                  working model.
                </p>
                <NextLink className="lp-more ds-focus" href="/trust">
                  Everything the stand promises
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
                What left the shelf, what PayPal captured, and which visits ended with nothing paid. One bar, to the
                cent.
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
              <figcaption>An example week from the demo stand, not real sales.</figcaption>
            </figure>
          </div>
        </section>

        <section id="go" data-tone="dark" className="void lp-chapter lp-go" aria-labelledby="go-h">
          <Beams />
          <div className="ds-container lp-go-in">
            <Reveal>
              <h2 id="go-h" className="ds-h1">
                Sell without being there
              </h2>
            </Reveal>
            <Reveal delay={0.06} className="lp-go-actions">
              <NextLink className="btn btn-coral" href="/demo">
                Try the demo
              </NextLink>
              <NextLink className="btn btn-ghost" href="/owner">
                Open the owner&apos;s dashboard
              </NextLink>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
