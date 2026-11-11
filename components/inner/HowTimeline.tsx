import NextLink from "next/link";
import { EXTRA_ANGLES } from "@/lib/angles";
import { GRID_COLS, GRID_ROWS, MOVING_BLOCKS } from "@/lib/frame-diff";
import { JOIN_WINDOW_MS, LATE_PAY_MS, OPEN_TIMEOUT_MS } from "@/lib/visits";
import { Beam } from "./Beam";
import type { Item } from "./bits";
import { GridVis, OwnerVis, PairVis, PayVis, type PeekRow, ShelfVis, StandVis, StatusVis, VisitVis } from "./HowVisuals";
import { Step } from "./Step";

const JOIN_SECONDS = JOIN_WINDOW_MS / 1000;
const OPEN_MINUTES = OPEN_TIMEOUT_MS / 60_000;
const LATE_HOURS = LATE_PAY_MS / 3_600_000;

type Fact = [term: string, value: string];

function Copy({ title, children, facts }: { title: string; children: React.ReactNode; facts?: Fact[] }) {
  return (
    <div className="in-step-copy">
      <h3>{title}</h3>
      {children}
      {facts && (
        <dl className="in-facts">
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The whole visit, in the order it happens, down one traced line. */
export function HowTimeline({ items, rows }: { items: Item[]; rows: PeekRow[] }) {
  return (
    <Beam>
      <ol className="in-steps">
        <Step n={1}>
          <Copy title="Someone takes what they want">
            <p>
              No app to open, no barcode to scan, nothing to type. They lift a jar off the shelf, the way they would at
              any stand with an honesty box.
            </p>
          </Copy>
          <ShelfVis />
        </Step>

        <Step n={2}>
          <Copy
            title="The stand notices the shelf changed"
            facts={[
              ["Compared as", `${GRID_COLS} × ${GRID_ROWS} blocks`],
              ["Counts as movement", `${MOVING_BLOCKS} blocks or more`],
              ["Reads the shelf after", "1 second of stillness"],
            ]}
          >
            <p>
              A phone propped at the shelf keeps comparing small greyscale frames, block by block. It takes out any
              overall change in brightness first, so a cloud passing or the camera adjusting does not count. Then it
              waits for everything to go still.
            </p>
            <p>A hand that comes and goes without changing anything sets nothing off.</p>
          </Copy>
          <GridVis />
        </Step>

        <Step n={3}>
          <Copy
            title="Two photos go to a vision model"
            facts={[
              ["Sent", "Before, after, and a close-up of what changed"],
              ["Extra cameras", `Up to ${EXTRA_ANGLES.length}, from other sides`],
              ["Comes back", "Product ids and counts"],
            ]}
          >
            <p>
              The model gets the shelf as it was and as it is now, and one question: which products changed in count,
              and by how many. It is told to ignore hands, people, shadows and lighting, and that an item moved along
              the shelf has not been taken.
            </p>
          </Copy>
          <PairVis />
        </Step>

        <Step n={4}>
          <Copy
            title="The server prices it and opens a visit"
            facts={[
              ["Prices from", "The owner’s catalogue"],
              ["Joins the same visit", `Within ${JOIN_SECONDS} seconds`],
              ["Most of one item", "20"],
            ]}
          >
            <p>
              The answer is checked before anything is billed: only products in the catalogue, only whole numbers. The
              total is added up in code, in whole cents. Take something else within the minute and it joins the same
              visit; put something back and it comes off.
            </p>
          </Copy>
          <VisitVis items={items} joinSeconds={JOIN_SECONDS} />
        </Step>

        <Step n={5}>
          <Copy title="The bill and a PayPal code appear">
            <p>
              The stand screen shows what was taken, the total, and a code that opens this visit’s pay page. It keeps
              checking, so a correction or a payment made on the phone shows up on the stand a couple of seconds later.
            </p>
            <p>If the shelf could not be read, the visit still opens and the shopper enters what they took by hand.</p>
          </Copy>
          <StandVis items={items} />
        </Step>

        <Step n={6}>
          <Copy title="They fix the bill if it is wrong, then pay">
            <p>
              The camera can miscount, so the bill is theirs to correct: change a quantity, remove a line, add
              something it missed. Each bill becomes an itemised PayPal order. If the bill changes, the old order is
              dropped, so money is only ever taken for the bill on screen.
            </p>
            <p>Try it: the steppers on this one work.</p>
          </Copy>
          <PayVis items={items} />
        </Step>

        <Step n={7}>
          <Copy
            title={`Nothing paid after ${OPEN_MINUTES} minutes is called unmatched`}
            facts={[
              ["Open for", `${OPEN_MINUTES} minutes`],
              ["Can still be paid for", `${LATE_HOURS} hours`],
            ]}
          >
            <p>
              Unmatched is the whole of what it says: something left the shelf and no payment has arrived yet. Nobody
              is named, nobody is accused. The link keeps working for a day, and a payment that arrives then shows as
              paid late.
            </p>
          </Copy>
          <StatusVis items={items} minutes={OPEN_MINUTES} hours={LATE_HOURS} />
        </Step>

        <Step n={8}>
          <Copy title="The owner sees all of it">
            <p>
              Every visit lands in the dashboard with what was taken, what was paid and where it stands. The paid
              figure is the amount PayPal captured.
            </p>
            <p>
              <NextLink href="/owners" className="in-link ds-focus">
                See the owner’s side
              </NextLink>
            </p>
          </Copy>
          <OwnerVis rows={rows} />
        </Step>
      </ol>
    </Beam>
  );
}
