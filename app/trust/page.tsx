import type { Metadata } from "next";
import NextLink from "next/link";
import { Reveal } from "@/components/inner/Reveal";
import { catalogue, demoWeek } from "@/components/inner/seedFigures";
import { TrustBento } from "@/components/inner/TrustBento";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { LATE_PAY_MS, OPEN_TIMEOUT_MS } from "@/lib/visits";
import "../inner.css";

export const metadata: Metadata = {
  title: "Trust",
  description:
    "What Shopsitter’s camera looks at, what it stores and who can see it. It counts items, not people, never accuses anyone, and leaves the money to PayPal.",
};

const STORED = [
  {
    what: "Two shelf photos per change",
    detail: "The shelf before and after, each time it changes.",
    why: "So the owner can check a bill against the shelf.",
    who: "The signed-in owner of that stand. They are also sent to the vision model’s provider to be read.",
  },
  {
    what: "The close-up of what changed",
    detail: "Cut from the same two frames.",
    why: "Helps the model tell small items apart.",
    who: "Sent with the photos for that one read. Not stored.",
  },
  {
    what: "Stills from extra cameras",
    detail: "Only if more phones are set up. The newest still and the one from the last read, each replaced by the next.",
    why: "To see items the main camera cannot.",
    who: "Kept behind the owner’s sign-in and sent with the read. The dashboard does not show them.",
  },
  {
    what: "The visit",
    detail: "Items and counts, status, times, and how sure the model was.",
    why: "It is the bill, and the owner’s record of it.",
    who: "The owner. Anyone holding that visit’s pay link sees that one bill.",
  },
  {
    what: "PayPal’s references",
    detail: "The order id, the payment id, the amount paid and any refund.",
    why: "To match a payment to a visit and to send a refund.",
    who: "The owner. Card details stay with PayPal and never reach Shopsitter.",
  },
  {
    what: "A daily count of people",
    detail: "One number per day. No picture, no identity.",
    why: "So the owner can see how many stopped by.",
    who: "The owner.",
  },
  {
    what: "The catalogue",
    detail: "Names, prices, a short description and an optional photo of each product.",
    why: "Prices for the bill; descriptions and photos so the model knows what is what.",
    who: "The owner. Names and prices appear on the bill.",
  },
  {
    what: "Sign-in",
    detail: "A signed cookie saying which stand’s dashboard this browser may open. The stand code is remembered on the stand’s own phone.",
    why: "To keep the dashboard and the stand to their owner.",
    who: "Only that browser. There are no personal accounts and no email addresses.",
  },
];

const LIMITS = [
  [
    "A shelf photo is still a photo",
    "If someone is in front of the shelf at the moment it goes still, part of them can be in the picture. The model is told to ignore them, and only the signed-in owner can open it.",
  ],
  ["Photos leave the stand to be read", "The before and after photos go to the vision model’s provider for each read."],
  ["Nothing is deleted on a schedule yet", "Photos and visits stay until the stand is reset."],
  ["One passcode per stand", "The dashboard opens with a shared passcode, not a personal account."],
  ["It can miscount", "One shelf, about six products that look different from each other, and good light."],
  ["PayPal sandbox only", "It is a prototype. Payments run in PayPal’s test environment and no real money moves."],
];

export default async function Trust() {
  const week = await demoWeek();
  const unmatched = week.rows.find((r) => r.tone === "unmatched");

  return (
    <>
      <SiteNav tone="onLight" />
      <main className="in in-trust">
        <header className="in-hero in-hero-light in-hero-trust">
          <div className="ds-container">
            <h1 className="in-h1">
              It counts jars,
              <br />
              not people
            </h1>
            <p className="ds-lead">
              A camera at an unattended stand has to earn its place. These are the rules Shopsitter keeps, each one
              shown working, then exactly what it stores and who can see it.
            </p>
          </div>
        </header>

        <section className="in-bento-band" aria-label="What Shopsitter promises">
          <div className="ds-container">
            <TrustBento
              items={catalogue()}
              unmatched={{ what: unmatched?.what ?? "", amount: unmatched?.detected ?? "" }}
              minutes={OPEN_TIMEOUT_MS / 60_000}
              hours={LATE_PAY_MS / 3_600_000}
            />
          </div>
        </section>

        <section className="in-band in-band-tint" aria-labelledby="stored-h">
          <div className="ds-container">
            <Reveal>
              <h2 id="stored-h" className="ds-h2">
                What is stored
              </h2>
              <p className="in-sub in-sub-wide">Everything Shopsitter keeps, why it keeps it, and who can see it.</p>
            </Reveal>
            <Reveal delay={0.06}>
              <table className="in-table">
                <thead>
                  <tr>
                    <th scope="col">What</th>
                    <th scope="col">Why</th>
                    <th scope="col">Who can see it</th>
                  </tr>
                </thead>
                <tbody>
                  {STORED.map((row) => (
                    <tr key={row.what}>
                      <th scope="row">
                        {row.what}
                        <span>{row.detail}</span>
                      </th>
                      <td data-label="Why">{row.why}</td>
                      <td data-label="Who can see it">{row.who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        <section className="in-band" aria-labelledby="limits-h">
          <div className="ds-container in-split">
            <Reveal>
              <h2 id="limits-h" className="ds-h2">
                The limits
              </h2>
              <p className="in-sub">Where the promises run out, so nobody finds out the hard way.</p>
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
              Check it yourself
            </h2>
            <p className="ds-lead">Run a visit in the demo, then open the dashboard and see what was kept.</p>
            <div className="in-close-actions">
              <NextLink href="/demo" className="in-btn in-btn-coral ds-focus">
                Try the demo
              </NextLink>
              <NextLink href="/owner/login" className="in-btn in-btn-ghost ds-focus">
                Open the demo dashboard
              </NextLink>
            </div>
            <p className="in-close-note">
              The dashboard’s passcode is <strong>demo</strong>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
