import type { Metadata } from "next";
import NextLink from "next/link";
import { LedgerStage } from "@/components/inner/LedgerStage";
import { HoldModel, ShelfTiles } from "@/components/inner/OwnerModels";
import { ChartTiles, SettleDemo, StockBars } from "@/components/inner/OwnerSpecimens";
import { Reveal } from "@/components/inner/Reveal";
import { demoWeek } from "@/components/inner/seedFigures";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { EXTRA_ANGLES } from "@/lib/angles";
import { HOLD_BASIS_DAYS, HOLD_MIN_VISITS } from "@/lib/hold";
import "../inner.css";

export const metadata: Metadata = {
  title: "For owners",
  description:
    "Your store map with a QR per shelf, how shoppers pay, unmatched by shelf, refunds and restocking, for any shop from one shelf to many aisles. And how to set one up.",
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
              Every shelf in your shop ends up on one page: what left it, what was paid through PayPal, and what is
              still unmatched.
            </p>
            <LedgerStage
              parts={week.parts}
              totalCents={week.totalCents}
              visitCount={week.visitCount}
              days={week.days}
              rows={week.rows.slice(0, 5)}
            />
            <p className="in-night-note">
              The demo shop’s example week: {week.visitCount} made-up visits, not real sales. The demo dashboard starts
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
              <p className="in-sub">All of it in the owner area today, whether your shop is one shelf or several aisles.</p>
            </Reveal>

            <ul className="in-do">
              <Reveal as="li">
                <h3>Lay out your store, and see unmatched by shelf</h3>
                <p>
                  Group your shelves by aisle. Each shelf gets its own camera link and QR, and its own product list, so
                  its camera only ever chooses among what is on it. A door QR lets shoppers check in. Each shelf shows
                  what left it and how much of that is still unmatched.
                </p>
                <ShelfTiles shelves={week.shelves} />
              </Reveal>

              <Reveal as="li">
                <h3>Choose how shoppers pay</h3>
                <p>
                  Pay after: the shelf shows the bill and a PayPal QR. Hold first: the shopper scans the door QR and
                  PayPal holds an amount; they are charged only for what they take and the rest is released. Or let each
                  shopper choose.
                </p>
                <p>
                  The suggested hold covers nine in ten paid baskets of the last {HOLD_BASIS_DAYS} days, rounded up to
                  the next $5 and kept between your minimum and maximum. With fewer than {HOLD_MIN_VISITS} paid visits it
                  is twice your minimum. You can also set your own amount.
                </p>
                <HoldModel />
              </Reveal>

              <Reveal as="li">
                <h3>Mark a visit settled another way</h3>
                <p>
                  Someone left cash in the tin, or paid you when they saw you. One button takes the visit out of
                  unmatched, and releases a hold if there was one. Try it.
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
                  The demo&apos;s example visits were never really paid, so they cannot be refunded. A bill you pay in
                  the demo can.
                </p>
              </Reveal>

              <Reveal as="li">
                <h3>Restock before it runs out</h3>
                <p>
                  Shelf levels count down as items are taken, and a product with one or none left is marked for
                  restocking.
                </p>
                <StockBars stock={week.stock} />
              </Reveal>

              <Reveal as="li">
                <h3>Products with photos</h3>
                <p>
                  A name, a price, a short description and a reference photo for each product. The photo is shown to the
                  vision model next to the shelf, so it can tell your honey from your jam.
                </p>
              </Reveal>

              <Reveal as="li">
                <h3>Ask your shop</h3>
                <p>
                  Type a question such as &ldquo;what sold best this week?&rdquo;. A language model answers from your own
                  records, and an answer with an amount that is not in them is refused.
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

        <section className="in-band in-band-tint" aria-labelledby="cams-h">
          <div className="ds-container">
            <Reveal>
              <h2 id="cams-h" className="ds-h2">
                Cameras you already own
              </h2>
              <p className="in-sub in-sub-wide">
                Phones today; webcams and CCTV through a small bridge program that sends only the shelf&apos;s part of
                the picture.
              </p>
            </Reveal>
            <ul className="ot-cams">
              <Reveal as="li">
                <span className="ot-cam-state" data-now="">
                  Works today
                </span>
                <h3>Phones</h3>
                <p>
                  Any phone with a camera and a browser, opened from the shelf&apos;s camera link and propped where it
                  can see the shelf. Up to {EXTRA_ANGLES.length} more phones can watch a shelf from other sides.
                </p>
              </Reveal>
              <Reveal as="li" delay={0.06}>
                <span className="ot-cam-state">Through the bridge</span>
                <h3>USB webcams</h3>
                <p>A webcam on a computer in the shop, with the bridge program running beside it.</p>
              </Reveal>
              <Reveal as="li" delay={0.12}>
                <span className="ot-cam-state">Through the bridge</span>
                <h3>CCTV</h3>
                <p>
                  A camera you already have on the shop floor. The bridge cuts out each shelf&apos;s part of the picture
                  and sends only that; the rest of the picture does not leave the building.
                </p>
              </Reveal>
            </ul>
          </div>
        </section>

        <section className="in-band" aria-labelledby="grow-h">
          <div className="ds-container">
            <Reveal>
              <h2 id="grow-h" className="ds-h2">
                From one shelf to many aisles
              </h2>
              <p className="in-sub in-sub-wide">
                A shop here is shelves grouped by aisle, each with its own camera and product list, so it grows one shelf
                at a time. A market stall can start with one phone on one shelf. A bigger store can start with one aisle
                or a grab-and-go section, using the CCTV it already has through the bridge, and add aisles from there.
              </p>
              <p className="in-sub in-sub-wide">
                So far it has been proven on a small sample store. A full supermarket, with thousands of products, crowds
                and staff restocking mid-visit, has not been tried, and neither has a real CCTV stream.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="in-band" aria-labelledby="setup-h">
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
                <h3>Start a trial, or sign in</h3>
                <p>
                  Start a private trial store from the <NextLink href="/demo">demo page</NextLink>: no account, deleted
                  after 24 hours. Or sign in to your own store with its passcode.
                </p>
              </Reveal>
              <Reveal as="li" delay={0.06}>
                <span className="in-setup-n num" aria-hidden="true">
                  2
                </span>
                <h3>Add shelves and products</h3>
                <p>
                  Name your shelves and their aisles, then add products with a price and a photo and put each on its
                  shelf.
                </p>
              </Reveal>
              <Reveal as="li" delay={0.12}>
                <span className="in-setup-n num" aria-hidden="true">
                  3
                </span>
                <h3>Open the cameras, print the door QR</h3>
                <p>
                  Open each shelf&apos;s camera link on a phone pointed at that shelf. If you use holds or check-in,
                  print the door QR. You can make a new one at any time, and the old one stops working.
                </p>
              </Reveal>
            </ol>
          </div>
        </section>

        <section className="void in-close" aria-labelledby="close-h">
          <div className="ds-container">
            <h2 id="close-h" className="ds-h2">
              Look around a working store
            </h2>
            <p className="ds-lead">The dashboard on this page is a miniature. The real one is a sign-in away.</p>
            <div className="in-close-actions">
              <NextLink href="/demo/store" className="in-btn in-btn-coral ds-focus">
                Watch a whole store run
              </NextLink>
              <NextLink href="/owner/login" className="in-btn in-btn-ghost ds-focus">
                Open the demo dashboard
              </NextLink>
            </div>
            <p className="in-close-note">
              The demo dashboard&apos;s passcode is <strong>demo</strong>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
