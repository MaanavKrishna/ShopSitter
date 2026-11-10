import Link from "next/link";
import { ShelfDemo } from "@/components/ShelfDemo";
import { Starburst } from "@/components/Starburst";
import { Wordmark } from "@/components/Wordmark";
import { DEMO_PRODUCTS } from "@/lib/seed";

export default function Home() {
  return (
    <>
      <section className="hero grass">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <Link href="/demo">Try the demo</Link>
            <Link href="/owner">Owner&apos;s view</Link>
          </nav>
        </header>
        <ShelfDemo products={DEMO_PRODUCTS} />
      </section>

      <main>
        <section className="band band-paper" aria-labelledby="how-h">
          <h2 id="how-h">How a visit goes</h2>
          <p className="band-lede">The customer never opens an app, scans a barcode or types a thing.</p>
          <ol className="steps">
            <li>
              <div>
                <h3>They take what they want</h3>
                <p>A spare phone propped by the shelf notices the shelf change and waits for it to go still.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>The bill writes itself</h3>
                <p>
                  An AI model compares the shelf before and after and names what left. The stand shows the bill and
                  a QR code. If it got something wrong, they fix it on their own phone.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>They pay with PayPal</h3>
                <p>The stand says &ldquo;Paid, thank you&rdquo; and the owner&apos;s dashboard updates.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="band grass band-grass" aria-labelledby="owner-h">
          <div className="owner-peek">
            <div>
              <h2 id="owner-h">You weren&apos;t there, and you still know</h2>
              <p className="band-lede">
                What sold, what was paid through PayPal, and which visits ended with nothing paid. Those are called
                unmatched, never theft: Shopsitter doesn&apos;t accuse anyone, and you can mark them settled if
                someone left cash.
              </p>
              <Link className="btn btn-yellow" href="/owner">
                Open the demo stand&apos;s dashboard
              </Link>
              <p className="peek-caption">The passcode is &ldquo;demo&rdquo;.</p>
            </div>
            <div>
              <dl className="peek-cards">
                <div className="card card-white">
                  <dt>Taken from the shelf</dt>
                  <dd className="money">$116.00</dd>
                </div>
                <div className="card">
                  <dt>Paid through PayPal</dt>
                  <dd className="money">$96.50</dd>
                </div>
                <div className="card card-pink">
                  <dt>Unmatched</dt>
                  <dd className="money">$8.00</dd>
                </div>
                <div className="card card-lime">
                  <dt>Adjusted by customers</dt>
                  <dd className="money">$7.00</dd>
                </div>
              </dl>
              <p className="peek-caption">An example week from the demo stand, not real sales.</p>
            </div>
          </div>
        </section>

        <section className="band band-paper" aria-labelledby="promise-h">
          <h2 id="promise-h">It counts jars, not people</h2>
          <ul className="promises">
            <li>
              <h3>The camera sees the shelf only</h3>
              <p>No faces, no video. It keeps one photo from before a visit and one from after.</p>
            </li>
            <li>
              <h3>The AI never sets a price</h3>
              <p>It only names products and counts. Every total is worked out in code, to the cent.</p>
            </li>
            <li>
              <h3>The customer has the last word</h3>
              <p>They can correct the bill before paying. A corrected bill is shown to the owner as adjusted.</p>
            </li>
          </ul>
        </section>

        <section className="band" aria-labelledby="built-h">
          <h2 id="built-h">What does the work</h2>
          <table className="built">
            <tbody>
              <tr>
                <th scope="row">PayPal</th>
                <td>
                  Creates an itemised order for each bill, takes the payment, and sends refunds. The owner&apos;s
                  numbers are matched against PayPal&apos;s own records. Sandbox only: no real money moves.
                </td>
              </tr>
              <tr>
                <th scope="row">An AI vision model</th>
                <td>Compares the before and after photos and returns product names and counts, nothing else.</td>
              </tr>
              <tr>
                <th scope="row">AG Studio</th>
                <td>Draws the owner&apos;s sales charts, which they can rearrange or add to.</td>
              </tr>
            </tbody>
          </table>
          <p className="limits">
            It&apos;s a prototype, with limits: one shelf, about six products that look different from each other, and
            good light. It can miscount, which is why the customer can always fix the bill.
          </p>
        </section>

        <section className="band grass band-grass" aria-labelledby="close-h">
          <div className="close">
            <div className="flash" style={{ ["--card" as string]: "var(--yellow)" }}>
              <Starburst points={24} depth={0.88} />
              <h2 id="close-h">Sell without being there</h2>
            </div>
            <div className="close-actions">
              <Link className="btn btn-yellow" href="/demo">
                Try it with real shelf photos
              </Link>
              <Link className="btn btn-quiet" href="/owner">
                See the owner&apos;s view
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot grass">
        <span>Shopsitter, built for the PayPal AI Hackathon 2026.</span>
        <span>Payments run in the PayPal sandbox.</span>
      </footer>
    </>
  );
}
