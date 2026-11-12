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
    "What Shopsitter’s shelf cameras look at, what it stores and who can see it. It counts items, not people, never accuses anyone, holds only what it may capture, and leaves the money to PayPal.",
};

const STORED = [
  {
    what: "Two shelf photos per change",
    detail: "That shelf before and after, each time it changes.",
    why: "So the owner can check a bill against the shelf.",
    who: "The signed-in owner of that store. They are also sent to the vision model’s provider to be read.",
  },
  {
    what: "The close-up of what changed",
    detail: "Cut from the same two frames.",
    why: "Helps the model tell small items apart.",
    who: "Sent with the photos for that one read. Not stored.",
  },
  {
    what: "Stills from extra cameras",
    detail: "Only if more phones watch a shelf. The newest still and the one from the last read, each replaced by the next.",
    why: "To see items the main camera cannot.",
    who: "Kept behind the owner’s sign-in and sent with the read. The dashboard does not show them.",
  },
  {
    what: "The visit",
    detail: "Items and counts, which shelf, status, times, and how sure the model was. An adjusted bill keeps what the camera saw beside it.",
    why: "It is the bill, and the owner’s record of it.",
    who: "The owner. Anyone holding that visit’s link sees that one bill: lines, total, payment state and receipt reference.",
  },
  {
    what: "A session id",
    detail: "100 random bits, in the link of a shopper’s basket after they check in at the door.",
    why: "It is the only thing a shopper holds. It opens one basket.",
    who: "Whoever has the link. It also shows changes in that shop nobody has claimed since they checked in, so they can claim their own.",
  },
  {
    what: "The door code",
    detail: "Signed into the door QR: which store, which door, and a number the owner moves on to cancel it.",
    why: "To check shoppers in. It cannot be used as a camera key, or the other way round.",
    who: "Anyone who scans the printed QR.",
  },
  {
    what: "Holds and the money trail",
    detail: "The amount PayPal authorised, the amount captured, and each authorise, capture, release and refund, in order.",
    why: "To charge no more than was held, release the rest, and show where every cent went.",
    who: "The owner.",
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
    what: "The store and its catalogue",
    detail: "Shelves and aisles, pay settings, and each product’s name, price, shelf, short description and optional photo.",
    why: "Prices for the bill; descriptions and photos so the model knows what is what.",
    who: "The owner. Names and prices appear on the bill.",
  },
  {
    what: "Sign-in",
    detail: "A signed cookie saying which store’s dashboard this browser may open. Each camera remembers its code, or a trial store’s key.",
    why: "To keep the dashboard and the cameras to their owner.",
    who: "Only that browser. There are no personal accounts and no email addresses.",
  },
];

const LIMITS = [
  [
    "A shelf photo is still a photo",
    "If someone is in front of the shelf when it goes still, part of them can be in the picture. The model is told to ignore them, and only the signed-in owner can open it.",
  ],
  ["Photos leave the shop to be read", "The before and after photos go to the vision model’s provider for each read."],
  [
    "Rate limits are per server instance",
    "They are counted in memory on each instance, so on serverless hosting the real ceilings are higher than the configured numbers and reset on a cold start.",
  ],
  [
    "The door QR does not expire",
    "Making a new one is how it is cancelled. Someone holding a valid door code can check in from anywhere.",
  ],
  ["One passcode per store", "The dashboard opens with a shared passcode, not a personal account. There are no roles."],
  [
    "Little runs on a schedule",
    "A trial store is deleted the next time it is touched after its day is up; the demo store resets at most hourly when opened. Any other store keeps its data until it is deleted by hand.",
  ],
  [
    "It can miscount",
    "Products on a shelf should look different from each other, the light should be reasonable, and several shoppers at once rely on people claiming their own items.",
  ],
  ["One shared sandbox account", "Every store here uses the same PayPal sandbox merchant, so the question box gives PayPal lookups carefully: trial stores get none."],
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
              Cameras watching a shop&rsquo;s shelves have to earn their place. These are the rules Shopsitter keeps, each one
              shown working as a small model, then exactly what it stores and who can see it.
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
            <p className="ds-lead">
              Run a visit in a trial store of your own, then open its dashboard and see what was kept. A trial and
              everything in it is deleted after 24 hours.
            </p>
            <div className="in-close-actions">
              <NextLink href="/demo" className="in-btn in-btn-coral ds-focus">
                Run your own
              </NextLink>
              <NextLink href="/demo/store" className="in-btn in-btn-ghost ds-focus">
                Watch a whole store run
              </NextLink>
            </div>
            <p className="in-close-note">
              Or open the <NextLink href="/owner/login">demo dashboard</NextLink> with the passcode <strong>demo</strong>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
