import NextLink from "next/link";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VoidHero } from "@/components/VoidHero";
import { Wordmark } from "@/components/Wordmark";
import { listSamples } from "@/lib/samples";
import { DEMO_PRODUCTS } from "@/lib/seed";
import "./landing.css";

const STEPS = [
  {
    title: "They take what they want",
    body: "A phone propped by the shelf notices the shelf change and waits for it to go still.",
  },
  {
    title: "The camera reads the shelf",
    body: "A vision model compares a photo from before with one from after, and names what left and how many.",
  },
  {
    title: "A bill and a PayPal QR appear",
    body: "They scan the code, fix anything the bill got wrong on their own phone, and pay with PayPal.",
  },
  {
    title: "The owner sees it",
    body: "The stand says “Paid, thank you” and the dashboard shows what sold, what was paid and what is unmatched.",
  },
];

const PROMISES = [
  {
    title: "It never accuses anyone",
    body: "A visit with nothing paid after ten minutes is called unmatched, and nothing more. It can still be paid for a day, and the owner can mark it settled if someone left cash.",
    tag: "Unmatched",
  },
  {
    title: "It counts items, not people",
    body: "The vision model is told to ignore hands and people and report only products and counts. The stand keeps one shelf photo from before a visit and one from after. Nobody is identified.",
  },
  {
    title: "The server sets every price",
    body: "The vision model returns product names and counts, and is never asked for a price. Prices come from the owner’s catalogue, and every total is worked out in code, to the cent.",
  },
  {
    title: "PayPal handles the money",
    body: "Each bill becomes an itemised PayPal order. Payment and refunds go through PayPal, and the paid figure the owner sees is the amount PayPal captured.",
  },
];

const PARTS = [
  {
    name: "PayPal",
    does: "Creates an itemised order for each bill, takes the payment, and sends refunds. Sandbox only: no real money moves.",
  },
  {
    name: "A vision model",
    does: "Compares the before and after photos and returns product names and counts, nothing else.",
  },
  {
    name: "AG Studio",
    does: "Draws the owner’s sales charts, which they can rearrange or add to.",
  },
];

export default function Home() {
  const hasSamples = listSamples().length > 0;

  return (
    <>
      <section className="void hero">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <NextLink href="/demo">Try the demo</NextLink>
            <NextLink href="/owner">Owner&apos;s view</NextLink>
          </nav>
        </header>
        <VoidHero products={DEMO_PRODUCTS} />
      </section>

      <main className="lp">
        <section className="lp-band" aria-labelledby="how-h">
          <div className="lp-wrap">
            <h2 id="how-h" className="lp-title">
              How a visit goes
            </h2>
            <p className="lp-lede">
              Shopsitter minds a stand nobody is standing at. The customer never opens an app, scans a barcode or types
              a thing.
            </p>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="lp-step-text">
                    <Heading level={3} className="lp-h3">{s.title}</Heading>
                    <Text as="p" size="base" color="secondary">
                      {s.body}
                    </Text>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="void lp-band lp-band-void" aria-labelledby="owner-h">
          <div className="lp-wrap lp-owner">
            <div>
              <h2 id="owner-h" className="lp-title">
                You weren&apos;t there, and you still know
              </h2>
              <p className="lp-lede">
                What sold, what was paid through PayPal, and which visits ended with nothing paid. Those are called
                unmatched: Shopsitter doesn&apos;t accuse anyone, and you can mark them settled if someone left cash.
              </p>
              <div className="lp-owner-cta">
                <NextLink className="btn btn-coral" href="/owner">
                  Open the demo stand&apos;s dashboard
                </NextLink>
                <p className="lp-note">
                  The passcode is <strong>demo</strong>.
                </p>
              </div>
            </div>
            <figure className="lp-peek-wrap">
              <dl className="glass lp-peek">
                <div>
                  <dt>Taken from the shelf</dt>
                  <dd className="num">$116.00</dd>
                </div>
                <div className="lp-peek-main">
                  <dt>Paid through PayPal</dt>
                  <dd className="num">$96.50</dd>
                </div>
                <div>
                  <dt>Unmatched</dt>
                  <dd className="num">$8.00</dd>
                </div>
                <div>
                  <dt>Adjusted by customers</dt>
                  <dd className="num">$7.00</dd>
                </div>
              </dl>
              <figcaption className="lp-note">An example week from the demo stand, not real sales.</figcaption>
            </figure>
          </div>
        </section>

        <section className="lp-band" aria-labelledby="promise-h">
          <div className="lp-wrap">
            <h2 id="promise-h" className="lp-title">
              It counts jars, not people
            </h2>
            <p className="lp-lede">Four rules the stand keeps, so an owner and a customer can both trust the bill.</p>
            <ul className="lp-promises">
              {PROMISES.map((p) => (
                <li key={p.title}>
                  <Card padding={6} height="100%">
                    <div className="lp-promise">
                      <div className="lp-promise-head">
                        <Heading level={3} className="lp-h3">{p.title}</Heading>
                        {p.tag && <Badge variant="neutral" label={p.tag} />}
                      </div>
                      <Text as="p" size="base" color="secondary">
                        {p.body}
                      </Text>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-band lp-band-tint" aria-labelledby="built-h">
          <div className="lp-wrap">
            <h2 id="built-h" className="lp-title">
              What does the work
            </h2>
            <dl className="lp-parts">
              {PARTS.map((p) => (
                <div key={p.name}>
                  <dt>{p.name}</dt>
                  <dd>{p.does}</dd>
                </div>
              ))}
            </dl>
            <div className="lp-limits">
              <Banner
                status="info"
                title="It's a prototype, with limits"
                description="One shelf, about six products that look different from each other, and good light. It can miscount, which is why the customer can always fix the bill before paying. A corrected bill is shown to the owner as adjusted."
              />
            </div>
          </div>
        </section>

        <section className="lp-band" aria-labelledby="go-h">
          <div className="lp-wrap">
            <h2 id="go-h" className="lp-title">
              Sell without being there
            </h2>
            <p className="lp-lede">Three places to see it for yourself.</p>
            <ul className="lp-doors">
              <li>
                <Card padding={6} height="100%">
                  <div className="lp-door">
                    <Heading level={3} className="lp-h3">Try the demo</Heading>
                    <Text as="p" size="base" color="secondary">
                      {hasSamples
                        ? "Pick a before and after photo of the shelf. Shopsitter reads what was taken, writes the bill, and lets you pay it in the PayPal sandbox."
                        : "Shopsitter without a camera. The sample shelf photos aren’t in yet, so for now the page explains the run and points to what works today."}
                    </Text>
                    <div className="lp-door-action">
                      <Button label="Try the demo" variant="primary" size="lg" href="/demo" />
                    </div>
                  </div>
                </Card>
              </li>
              <li>
                <Card padding={6} height="100%">
                  <div className="lp-door">
                    <Heading level={3} className="lp-h3">Owner&apos;s dashboard</Heading>
                    <Text as="p" size="base" color="secondary">
                      What sold, what was paid and what is unmatched at the demo stand. Sign in with the passcode{" "}
                      <Text type="code">demo</Text>.
                    </Text>
                    <div className="lp-door-action">
                      <Button label="Owner sign-in" variant="secondary" size="lg" href="/owner" />
                    </div>
                  </div>
                </Card>
              </li>
              <li>
                <Card padding={6} height="100%">
                  <div className="lp-door">
                    <Heading level={3} className="lp-h3">The stand screen</Heading>
                    <Text as="p" size="base" color="secondary">
                      The screen that sits by the shelf and shows the bill and the QR code. It asks for the stand code
                      and uses this device&apos;s camera.
                    </Text>
                    <div className="lp-door-action">
                      <Button label="Open the stand screen" variant="secondary" size="lg" href="/stand" />
                    </div>
                  </div>
                </Card>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="void lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-top">
            <Wordmark />
            <nav aria-label="Footer">
              <NextLink href="/demo">Demo</NextLink>
              <NextLink href="/owner">Owner&apos;s view</NextLink>
              <NextLink href="/stand">Stand screen</NextLink>
            </nav>
          </div>
          <div className="lp-foot-base">
            <span>Shopsitter, built for the PayPal AI Hackathon 2026.</span>
            <span>Payments run in the PayPal sandbox. No real money moves.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
