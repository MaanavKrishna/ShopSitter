import NextLink from "next/link";
import { EXTRA_ANGLES } from "@/lib/angles";
import { GRID_COLS, GRID_ROWS, MOVING_BLOCKS } from "@/lib/frame-diff";
import { LATE_PAY_MS, OPEN_TIMEOUT_MS } from "@/lib/visits";
import { Beam } from "./Beam";
import type { Item } from "./bits";
import { GridVis, OwnerVis, PairVis, PayVis, type PeekRow, StatusVis } from "./HowVisuals";
import { ClaimVis, DoorVis, HoldVis, ReturnVis, StoreSetupVis } from "./HowStore";
import { Step } from "./Step";

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

/** The whole store visit, in the order it happens, down one traced line. */
export function HowTimeline({ items, rows }: { items: Item[]; rows: PeekRow[] }) {
  return (
    <Beam>
      <ol className="in-steps">
        <Step n={1}>
          <Copy
            title="The owner sets up shelves and cameras"
            facts={[
              ["A store is", "Shelves, grouped by aisle"],
              ["Each shelf has", "Its own camera and product list"],
              ["Cameras", "Phones today"],
            ]}
          >
            <p>
              Each shelf gets a name, an aisle, the products that sit on it, and a camera link. Open the link on a phone
              propped facing the shelf and that phone is the shelf&rsquo;s camera.
            </p>
            <p>
              Phones today; webcams and CCTV through a small bridge program that sends only the shelf&rsquo;s part of
              the picture.
            </p>
          </Copy>
          <StoreSetupVis />
        </Step>

        <Step n={2}>
          <Copy
            title="A shopper walks in"
            facts={[
              ["Door code", "Optional"],
              ["Hold", "Optional, set by the owner"],
              ["Who they are", "Nobody asks"],
            ]}
          >
            <p>
              They can simply take what they like and pay at the shelf. Or they scan the code at the door and a basket
              opens on their phone, with no app and no account.
            </p>
            <p>
              If the owner asks for a hold, PayPal sets an amount aside first. It is sized from what shoppers at this
              shop really spend: enough to cover nine in ten baskets of the last 30 days, within the owner&rsquo;s
              minimum and maximum.
            </p>
          </Copy>
          <DoorVis />
        </Step>

        <Step n={3}>
          <Copy
            title="A shelf changes, and its camera notices"
            facts={[
              ["Compared as", `${GRID_COLS} × ${GRID_ROWS} blocks`],
              ["Counts as movement", `${MOVING_BLOCKS} blocks or more`],
              ["Reads the shelf after", "1 second of stillness"],
            ]}
          >
            <p>
              The shelf&rsquo;s camera keeps comparing small greyscale frames, block by block. It takes out any overall
              change in brightness first, so a cloud passing does not count. Then it waits for the shelf to go still and
              sends a before photo, an after photo and a close-up of the area that changed.
            </p>
            <p>A hand that comes and goes without changing anything sets nothing off.</p>
          </Copy>
          <GridVis />
        </Step>

        <Step n={4}>
          <Copy
            title="The vision model sees only that shelf’s products"
            facts={[
              ["Chooses among", "This shelf’s products"],
              ["Extra cameras", `Up to ${EXTRA_ANGLES.length}, from other sides`],
              ["Comes back", "Product ids and counts"],
            ]}
          >
            <p>
              Because every shelf has its own short list, the model picks from a few products, not the whole shop. It is
              asked which changed in count and by how many, and told that an item slid along the shelf has not been
              taken.
            </p>
            <p>
              Its answer is checked before anything is billed: only that shelf&rsquo;s products, only whole numbers.
              Prices come from the owner&rsquo;s catalogue, added up on the server in whole cents.
            </p>
          </Copy>
          <PairVis />
        </Step>

        <Step n={5}>
          <Copy
            title="The item lands in the right basket"
            facts={[
              ["One shopper checked in", "It goes to them"],
              ["Several", "The first to claim it gets it"],
              ["Nobody checked in", "A visit at the shelf"],
            ]}
          >
            <p>
              With one shopper in the shop, the change goes straight into their basket. With several, it shows on each
              of their phones as a question, and whoever says it is theirs gets it. Nobody is identified; the camera
              counts items, not people.
            </p>
          </Copy>
          <ClaimVis items={items} />
        </Step>

        <Step n={6}>
          <Copy title="Put it back, and it comes off the bill">
            <p>
              Changed your mind? A jar returned to the shelf is read the same way, and it comes off the basket or visit
              it belonged to. The shopper can also correct a line by hand if the camera got it wrong.
            </p>
          </Copy>
          <ReturnVis items={items} />
        </Step>

        <Step n={7}>
          <Copy
            title="With a hold: tap Done, or just leave"
            facts={[
              ["Charged", "What you took"],
              ["Released", "The rest of the hold"],
              ["Basket larger than the hold", "The rest is paid on the next screen"],
            ]}
          >
            <p>
              The server captures the basket total, never more than was held, and PayPal releases the rest. A basket
              left alone for {OPEN_MINUTES} minutes is closed the same way.
            </p>
          </Copy>
          <HoldVis items={items} />
        </Step>

        <Step n={8}>
          <Copy title="Without a hold: pay on the phone, or at the shelf">
            <p>
              A checked-in shopper pays from their basket with PayPal. Anyone else scans the code on the shelf&rsquo;s
              screen, which opens the bill for that visit. The bill is theirs to correct first, and each bill becomes an
              itemised PayPal order, so money is only ever taken for the bill on screen.
            </p>
            <p>Try it: the steppers on this one work.</p>
          </Copy>
          <PayVis items={items} />
        </Step>

        <Step n={9}>
          <Copy
            title={`Nothing paid after ${OPEN_MINUTES} minutes is called unmatched`}
            facts={[
              ["Open for", `${OPEN_MINUTES} minutes`],
              ["Can still be paid for", `${LATE_HOURS} hours`],
              ["Owner can", "Mark it settled another way"],
            ]}
          >
            <p>
              Unmatched is the whole of what it says: something left a shelf and no payment has arrived yet. Nobody is
              named, nobody is accused. The link keeps working for a day, and a payment that arrives then shows as paid
              late.
            </p>
          </Copy>
          <StatusVis items={items} minutes={OPEN_MINUTES} hours={LATE_HOURS} />
        </Step>

        <Step n={10}>
          <Copy title="The owner sees it, shelf by shelf">
            <p>
              Every visit lands in the dashboard with what was taken, what was paid and where it stands, and the store
              map shows sales and unmatched value for each shelf. The paid figure is the amount PayPal captured.
            </p>
            <p>
              <NextLink href="/owners" className="in-link ds-focus">
                See the owner&rsquo;s side
              </NextLink>
            </p>
          </Copy>
          <OwnerVis rows={rows} />
        </Step>
      </ol>
    </Beam>
  );
}
