import type { Metadata } from "next";
import NextLink from "next/link";
import { LedgerStage } from "@/components/inner/LedgerStage";
import { ChartTiles, SettleDemo, StockBars } from "@/components/inner/OwnerSpecimens";
import { Reveal } from "@/components/inner/Reveal";
import { demoWeek } from "@/components/inner/seedFigures";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { EXTRA_ANGLES } from "@/lib/angles";
import "../inner.css";

export const metadata: Metadata = {
  title: "For owners",
  description:
    "What sold, what was paid through PayPal and which visits are unmatched, for a stand you were not standing at. See the owner’s dashboard and how a stand is set up.",
};

export default async function Owners() {
  const week = await demoWeek();
  const unmatched = week.rows.find((r) => r.tone === "unmatched");

  return (
    <>
      <SiteNav tone="onBlue" />
      <main className="in in-owners">
        <header className="in-hero in-night">
          <div className="ds-container">
            <h1 className="in-h1 in-h1-long">You weren’t there, and you still know</h1>
            <p className="ds-lead">
              Every visit to the stand ends up on one page: what left the shelf, what was paid through PayPal, and what
              is still unmatched.
            </p>
            <LedgerStage
              parts={week.parts}
              totalCents={week.totalCents}
              visitCount={week.visitCount}
              days={week.days}
              rows={week.rows.slice(0, 5)}
            />
            <p className="in-night-note">
              The demo stand’s example week: {week.visitCount} made-up visits, not real sales. The demo dashboard starts
              from these and changes as people try it.
            </p>
          </div>
        </header>

        <section className="in-band" aria-labelledby="do-h">
          <div className="ds-container in-split in-split-sticky">
            <Reveal>
              <h2 id="do-h" className="ds-h2">
                What you can do from there
              </h2>
              <p className="in-sub">Six things, all of them in the dashboard today.</p>
            </Reveal>

            <ul className="in-do">
              <Reveal as="li">
                <h3>See what sold, what was paid and what is unmatched</h3>
                <p>
                  One bar splits everything taken from the shelf into paid, unmatched and adjusted by the shopper. The
                  paid figure is the amount PayPal captured, not an estimate.
                </p>
              </Reveal>

              <Reveal as="li">
                <h3>Mark a visit settled another way</h3>
                <p>
                  Someone left cash in the tin, or paid you when they saw you. One button takes the visit out of
                  unmatched. Try it.
                </p>
                {unmatched && <SettleDemo what={unmatched.what} amount={unmatched.detected} />}
              </Reveal>

              <Reveal as="li">
                <h3>Refund through PayPal</h3>
                <p>
                  Give back all of a payment or part of it, up to what is left of it. The refund goes through PayPal
                  against the original payment, and a request that is retried is not sent twice.
                </p>
                <p className="in-do-aside">
                  The demo’s example visits were never really paid, so they cannot be refunded. A bill you pay in the
                  demo can.
                </p>
              </Reveal>

              <Reveal as="li">
                <h3>See what is running low</h3>
                <p>
                  The shelf list counts down as items are taken, and a product with one or none left is marked for
                  restocking.
                </p>
                <StockBars stock={week.stock} />
              </Reveal>

              <Reveal as="li">
                <h3>See how many people stopped by</h3>
                <p>
                  The stand can count the people who stop at it, next to how many paid. It is only a count: one number
                  a day, worked out on the stand itself. No picture of a person is stored or sent, and nobody is
                  identified.
                </p>
              </Reveal>

              <Reveal as="li">
                <h3>Rearrange the charts</h3>
                <p>
                  Sales by day, what sells and how visits ended are drawn with AG Studio. Move them around until the
                  page reads the way you think.
                </p>
                <ChartTiles />
              </Reveal>
            </ul>
          </div>
        </section>

        <section className="in-band in-band-tint" aria-labelledby="setup-h">
          <div className="ds-container">
            <Reveal>
              <h2 id="setup-h" className="ds-h2">
                Set up in three steps
              </h2>
            </Reveal>
            <ol className="in-setup">
              <Reveal as="li">
                <span className="in-setup-n num" aria-hidden="true">
                  1
                </span>
                <h3>Prop a phone at the shelf</h3>
                <p>
                  Any phone with a camera and a browser. Open the stand screen on it and point it at the shelf, close
                  enough to tell the products apart, in good light. Up to {EXTRA_ANGLES.length} more phones can watch
                  from other sides.
                </p>
              </Reveal>
              <Reveal as="li" delay={0.06}>
                <span className="in-setup-n num" aria-hidden="true">
                  2
                </span>
                <h3>Enter the stand code</h3>
                <p>
                  The stand asks for its code once and remembers it on that phone. Without the code, nothing can send
                  photos as your stand.
                </p>
              </Reveal>
              <Reveal as="li" delay={0.12}>
                <span className="in-setup-n num" aria-hidden="true">
                  3
                </span>
                <h3>Add your products</h3>
                <p>
                  A name, a price, what each one looks like, and a photo if you have one. You add and change them
                  yourself under Products in the owner area.
                </p>
              </Reveal>
            </ol>
          </div>
        </section>

        <section className="void in-close" aria-labelledby="close-h">
          <div className="ds-container">
            <h2 id="close-h" className="ds-h2">
              Look around the demo stand
            </h2>
            <p className="ds-lead">The dashboard on this page is a miniature. The real one is a sign-in away.</p>
            <div className="in-close-actions">
              <NextLink href="/owner/login" className="in-btn in-btn-coral ds-focus">
                Open the demo dashboard
              </NextLink>
              <NextLink href="/how-it-works" className="in-btn in-btn-ghost ds-focus">
                How a visit goes
              </NextLink>
            </div>
            <p className="in-close-note">
              The passcode is <strong>demo</strong>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
