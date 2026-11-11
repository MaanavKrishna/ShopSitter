import NextLink from "next/link";
import { MiniCode, ShelfDrawing } from "@/components/landing/visuals";

/**
 * Shown while there are no sample photos. It says so plainly, draws the three things a run
 * will do, and points at the two parts of the product that work today.
 */
export function DemoEmpty() {
  return (
    <div className="dm-empty">
      <section className="dm-empty-now" aria-labelledby="dm-now-h">
        <p className="dm-state">
          <i aria-hidden="true" />
          Sample photos: not in yet
        </p>
        <h2 id="dm-now-h" className="ds-h2">
          The shelf photos are still being taken
        </h2>
        <p className="ds-lead">
          They are on their way. Until they land, nothing here pretends to be a result: the three
          panels are drawings of what a run will do.
        </p>

        <ul className="dm-doors">
          <li>
            <NextLink className="dm-door dm-door-main ds-focus" href="/owner">
              <span>
                <strong>Open the owner&apos;s dashboard</strong>
                <small>
                  Passcode: <b>demo</b>
                </small>
              </span>
              <i aria-hidden="true">→</i>
            </NextLink>
          </li>
          <li>
            <NextLink className="dm-door ds-focus" href="/stand">
              <span>
                <strong>Open the stand screen</strong>
                <small>Asks for the stand code and a camera</small>
              </span>
              <i aria-hidden="true">→</i>
            </NextLink>
          </li>
        </ul>
      </section>

      <section className="dm-plan" aria-labelledby="dm-plan-h">
        <h2 id="dm-plan-h">What this page will do</h2>
        <ol>
          <li>
            <div className="dm-plan-art" aria-hidden="true">
              <div className="dm-art-pair">
                <figure>
                  <ShelfDrawing />
                  <figcaption>Before</figcaption>
                </figure>
                <figure>
                  <ShelfDrawing gone />
                  <figcaption>After</figcaption>
                </figure>
              </div>
            </div>
            <div className="dm-plan-text">
              <span className="num" aria-hidden="true">
                1
              </span>
              <h3>You pick a before and after photo</h3>
              <p>Real photos of the demo shelf, either side of one visitor.</p>
            </div>
          </li>
          <li>
            <div className="dm-plan-art" aria-hidden="true">
              <div className="void dm-art-bill">
                <span />
                <span />
                <span />
                <b />
              </div>
            </div>
            <div className="dm-plan-text">
              <span className="num" aria-hidden="true">
                2
              </span>
              <h3>Shopsitter reads the shelf and writes the bill</h3>
              <p>A vision model names what left. The server prices it from the catalogue.</p>
            </div>
          </li>
          <li>
            <div className="dm-plan-art" aria-hidden="true">
              <div className="dm-art-pay">
                <MiniCode />
                <span>PayPal sandbox</span>
              </div>
            </div>
            <div className="dm-plan-text">
              <span className="num" aria-hidden="true">
                3
              </span>
              <h3>You pay it in the PayPal sandbox</h3>
              <p>The customer&apos;s pay page opens. No real money moves.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
