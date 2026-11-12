"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { easeOut, spring, springSnappy } from "@/lib/motion";
import { Cutout, DrawnCode, type Item, StatusBadge, usd } from "./bits";
import "./owners-trust.css";
import { Glow } from "./Glow";
import { Photo } from "./HowVisuals";
import { Rolling, Stepper } from "./Stepper";
import { usePhase } from "./usePhase";

const price = (items: Item[], sku: string) => items.find((i) => i.sku === sku)?.priceCents ?? 0;
const nameOf = (items: Item[], sku: string) => items.find((i) => i.sku === sku)?.name ?? sku;

function Cell({
  area,
  title,
  children,
  demo,
}: {
  area: string;
  title: string;
  children: React.ReactNode;
  demo: React.ReactNode;
}) {
  return (
    <li className="in-cell" data-area={area}>
      <Glow />
      <div className="in-cell-demo">{demo}</div>
      <div className="in-cell-copy">
        <h3>{title}</h3>
        {children}
      </div>
    </li>
  );
}

/* A camera view: the jars are counted, the hand is not. */
const CAMERA_HOLDS = [2000, 2400, 2800] as const;
const IN_VIEW = ["jam", "honey", "eggs", "bread"];

function CameraDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref, CAMERA_HOLDS);
  const reduce = useReducedMotion();
  const hand = phase === 1;
  return (
    <div
      ref={ref}
      className="in-cam"
      role="img"
      aria-label="A camera view of four products, each in a box with a count. A hand reaches in and is marked as ignored."
    >
      <div className="in-cam-view" aria-hidden="true">
        <div className="in-cam-row">
          {IN_VIEW.map((sku) => (
            <span key={sku} className="in-cam-item">
              <Cutout sku={sku} />
              <i>{sku} × 1</i>
            </span>
          ))}
        </div>
        <div className="in-cam-board" />
        <motion.div
          className="in-cam-hand"
          initial={false}
          animate={hand ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: reduce ? 0 : 70, y: reduce ? 0 : -50 }}
          transition={spring}
        >
          <svg viewBox="0 0 120 120">
            <g transform="rotate(38 60 60)">
              <rect x="47" y="-60" width="26" height="100" rx="13" />
              <rect x="39" y="30" width="42" height="42" rx="15" />
              <rect x="27" y="38" width="11" height="26" rx="5.5" transform="rotate(-24 32 51)" />
              <rect x="40" y="66" width="9" height="26" rx="4.5" />
              <rect x="50.5" y="68" width="9" height="30" rx="4.5" />
              <rect x="61" y="68" width="9" height="28" rx="4.5" />
              <rect x="71.5" y="66" width="9" height="22" rx="4.5" />
            </g>
          </svg>
          <span>Hand in view: ignored</span>
        </motion.div>
      </div>
      <dl className="in-cam-readout" aria-hidden="true">
        <div>
          <dt>Counted</dt>
          <dd>Items on the shelf</dd>
        </div>
        <div>
          <dt>Kept about a person</dt>
          <dd>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={phase === 2 ? "count" : "none"}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                transition={springSnappy}
              >
                {phase === 2 ? "Today’s count, plus one" : "Nothing"}
              </motion.span>
            </AnimatePresence>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* A visit goes unmatched, and the owner can settle it. Nothing else happens. */
function NeverDemo({ what, amount, minutes }: { what: string; amount: string; minutes: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [state, setState] = useState<"open" | "unmatched" | "settled">("open");

  useEffect(() => {
    if (!inView || state !== "open") return;
    const timer = setTimeout(() => setState("unmatched"), reduce ? 0 : 2200);
    return () => clearTimeout(timer);
  }, [inView, reduce, state]);

  const badge = {
    open: <StatusBadge tone="open">Open</StatusBadge>,
    unmatched: <StatusBadge tone="unmatched">Unmatched</StatusBadge>,
    settled: <StatusBadge tone="settled">Settled another way</StatusBadge>,
  }[state];
  const note = {
    open: `Waiting up to ${minutes} minutes for a payment`,
    unmatched: "No payment arrived. That is all this says.",
    settled: "The owner says it was paid for some other way.",
  }[state];

  return (
    <div ref={ref} className="in-never">
      <div className="in-never-row">
        <span>{what}</span>
        <span className="num">{amount}</span>
      </div>
      <div className="in-status-clock" aria-hidden="true">
        <motion.span
          key={state === "open" ? "run" : "done"}
          data-tone={state === "unmatched" ? "unmatched" : state === "settled" ? "paid" : "open"}
          initial={{ scaleX: state === "open" && !reduce ? 0 : 1 }}
          animate={{ scaleX: inView || state !== "open" ? 1 : 0 }}
          transition={{ duration: state === "open" ? 2.2 : 0, ease: "linear" }}
        />
      </div>
      <div className="in-never-state" aria-live="polite">
        <span className="in-status-badge">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={state}
              initial={reduce ? { opacity: 0 } : { opacity: 0, rotateX: -80, y: 6 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, rotateX: 0, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotateX: 80, y: -6 }}
              transition={springSnappy}
            >
              {badge}
            </motion.span>
          </AnimatePresence>
        </span>
        <p>{note}</p>
      </div>
      <button
        type="button"
        className="in-spec-btn ds-focus"
        disabled={state === "open"}
        onClick={() => setState(state === "settled" ? "open" : "settled")}
      >
        {state === "settled" ? "Start again" : "Settled another way"}
      </button>
    </div>
  );
}

/* What the model sends, and the line the server writes from it. */
function PriceDemo({ items }: { items: Item[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- held back only once scripts are running
    if (!reduce) setArmed(true);
  }, [reduce]);
  const shown = !armed || inView;
  const qty = 2;
  const unit = price(items, "jam");
  return (
    <div ref={ref} className="in-price">
      <div>
        <span className="in-cell-tag">From the model</span>
        <code className="in-code">{`{ "sku": "jam", "qty": ${qty} }`}</code>
      </div>
      <svg className="in-price-arrow" viewBox="0 0 16 24" aria-hidden="true">
        <path d="M8 2v19M2.5 15.5L8 21l5.5-5.5" />
      </svg>
      <div>
        <span className="in-cell-tag">Written by the server</span>
        <motion.p
          className="in-price-line"
          initial={false}
          animate={shown ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 8, filter: "blur(4px)" }}
          transition={{ duration: 0.45, ease: easeOut, delay: shown && armed ? 0.35 : 0 }}
        >
          <span>{nameOf(items, "jam")}</span>
          <span>
            {qty} × {usd(unit)}
          </span>
          <span className="num">{usd(unit * qty)}</span>
        </motion.p>
      </div>
    </div>
  );
}

/* A bill the camera got wrong, put right. */
function FixDemo({ items }: { items: Item[] }) {
  const seen = 2;
  const [qty, setQty] = useState(seen);
  const unit = price(items, "honey");
  return (
    <div className="in-fix">
      <div className="in-fix-line">
        <span>
          {nameOf(items, "honey")}
          <em>The camera saw {seen}</em>
        </span>
        <Stepper name={nameOf(items, "honey")} qty={qty} onChange={setQty} />
      </div>
      <div className="in-sheet-total">
        <span>
          Total to pay
          {qty !== seen && <StatusBadge tone="adjusted">Adjusted</StatusBadge>}
        </span>
        <Rolling className="num" value={unit * qty} text={usd(unit * qty)} />
      </div>
    </div>
  );
}

/* The order as PayPal receives it. */
function OrderDemo({ items }: { items: Item[] }) {
  const lines = [
    { sku: "jam", qty: 2 },
    { sku: "bread", qty: 1 },
  ];
  const total = lines.reduce((sum, l) => sum + price(items, l.sku) * l.qty, 0);
  return (
    <div className="in-order">
      <div className="in-order-head">
        <span>PayPal order</span>
        <span className="in-order-env">Sandbox</span>
      </div>
      <ul>
        {lines.map((l) => (
          <li key={l.sku}>
            <span>{nameOf(items, l.sku)}</span>
            <span>
              {l.qty} × {usd(price(items, l.sku))}
            </span>
          </li>
        ))}
      </ul>
      <div className="in-order-total">
        <span>Item total</span>
        <span className="num">{usd(total)}</span>
      </div>
    </div>
  );
}

function PhotosDemo() {
  return (
    <div className="in-kept">
      <div className="in-pair-photos" aria-hidden="true">
        <div className="in-pair-cell">
          <Photo label="Before" />
        </div>
        <div className="in-pair-cell">
          <Photo label="After" without="honey" />
        </div>
      </div>
      <p className="in-kept-tag">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="2" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
        </svg>
        Opens only for the signed-in owner
      </p>
    </div>
  );
}


/* A hold: the amount is set aside, only the basket is captured, the rest goes back. */
const HOLD_CENTS = 2500;
function HoldDemo({ items }: { items: Item[] }) {
  const reduce = useReducedMotion();
  const [taken, setTaken] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const total = taken.reduce((sum, sku) => sum + price(items, sku), 0);
  const choices = ["honey", "bread", "eggs"].filter((sku) => price(items, sku) > 0);
  const canTake = (sku: string) => !done && total + price(items, sku) <= HOLD_CENTS;
  return (
    <div className="ot-card" role="group" aria-label="A model of a PayPal hold">
      <div className="ot-card-row">
        <span>Held by PayPal</span>
        <span className="num">{usd(HOLD_CENTS)}</span>
      </div>
      <div className="ot-meter" aria-hidden="true">
        <span className="ot-meter-held" />
        <motion.span
          className="ot-meter-used"
          initial={false}
          animate={{ scaleX: total / HOLD_CENTS }}
          transition={reduce ? { duration: 0 } : spring}
        />
      </div>
      <div className="ot-card-row">
        <span>Basket</span>
        <Rolling className="num" value={total} text={usd(total)} />
      </div>
      <div className="ot-card-actions">
        {done ? (
          <button type="button" className="in-spec-btn ds-focus" onClick={() => { setTaken([]); setDone(false); }}>
            Start again
          </button>
        ) : (
          <>
            {choices.map((sku) => (
              <button key={sku} type="button" className="in-spec-btn ds-focus" disabled={!canTake(sku)} onClick={() => setTaken((t) => [...t, sku])}>
                Take {nameOf(items, sku).toLowerCase()}
              </button>
            ))}
            <button type="button" className="in-spec-btn ds-focus" data-primary="" onClick={() => setDone(true)}>
              Done
            </button>
          </>
        )}
      </div>
      <p className="ot-card-note" aria-live="polite">
        {done
          ? `Charged ${usd(total)}. The other ${usd(HOLD_CENTS - total)} is released.`
          : "Nothing is charged yet. Take something, then tap Done."}
      </p>
    </div>
  );
}

/* Several shoppers at once: a change shows on their phones and the first to claim it gets it. */
function ClaimDemo({ items }: { items: Item[] }) {
  const reduce = useReducedMotion();
  const [answer, setAnswer] = useState<"ask" | "mine" | "not">("ask");
  const name = nameOf(items, "honey");
  return (
    <div className="ot-card" role="group" aria-label="A model of a claim on a shopper's phone">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={answer}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={springSnappy}
        >
          {answer === "ask" && <p className="ot-claim-q">Shelf 3 saw 1 × {name} leave. Yours?</p>}
          {answer === "mine" && (
            <div className="ot-card-row">
              <span>1 × {name}</span>
              <span className="num">{usd(price(items, "honey"))}</span>
            </div>
          )}
          {answer === "not" && <p className="ot-claim-q">Left for whoever took it.</p>}
        </motion.div>
      </AnimatePresence>
      <div className="ot-card-actions">
        {answer === "ask" ? (
          <>
            <button type="button" className="in-spec-btn ds-focus" data-primary="" onClick={() => setAnswer("mine")}>
              Mine
            </button>
            <button type="button" className="in-spec-btn ds-focus" onClick={() => setAnswer("not")}>
              Not mine
            </button>
          </>
        ) : (
          <button type="button" className="in-spec-btn ds-focus" onClick={() => setAnswer("ask")}>
            Start again
          </button>
        )}
      </div>
      <p className="ot-card-note" aria-live="polite">
        {answer === "mine" ? "Added to this basket. Nobody else can claim it now." : "Nobody is named or tracked."}
      </p>
    </div>
  );
}

/* The door QR: a new one stops the old one working. */
function DoorDemo() {
  const [round, setRound] = useState(1);
  return (
    <div className="ot-card" role="group" aria-label="A model of the door QR">
      <div className="ot-door">
        <span className="ot-door-code" data-old={round > 1 || undefined} aria-hidden="true">
          <DrawnCode />
        </span>
        <p className="ot-claim-q" aria-live="polite">
          {round > 1 ? `The old door QR no longer works. Door QR ${round} is the one to print.` : "Door QR 1 checks shoppers in."}
        </p>
      </div>
      <div className="ot-card-actions">
        <button type="button" className="in-spec-btn ds-focus" onClick={() => setRound((r) => r + 1)}>
          Make a new door QR
        </button>
      </div>
    </div>
  );
}

/** Nine promises, each with a small working model of what it means. */
export function TrustBento({
  items,
  unmatched,
  minutes,
  hours,
}: {
  items: Item[];
  unmatched: { what: string; amount: string };
  minutes: number;
  hours: number;
}) {
  return (
    <ul className="in-bento">
      <Cell area="camera" title="It counts items, not people" demo={<CameraDemo />}>
        <p>
          The vision model is told to ignore hands and people and to report only products and counts. The shelf camera
          also looks for a hand or a person, on the device itself, to know when someone has stopped by. Nothing about
          them is stored or sent: only a daily count goes up by one.
        </p>
        <p className="in-cell-small">The boxes are our drawing. What comes back from the model is ids and counts.</p>
      </Cell>

      <Cell
        area="never"
        title="It never accuses anyone"
        demo={<NeverDemo what={unmatched.what} amount={unmatched.amount} minutes={minutes} />}
      >
        <p>
          A visit with nothing paid after {minutes} minutes is called unmatched, and nothing more. No alarm, no name,
          no message to anyone. It can still be paid for {hours} hours, and the owner can mark it settled if someone
          left cash.
        </p>
        <p>
          The owner sees unmatched value per shelf. If every line is taken off a bill the camera saw, the visit stays
          in the figures as unmatched and marked adjusted, so the records add up either way.
        </p>
      </Cell>

      <Cell area="price" title="The server sets every price" demo={<PriceDemo items={items} />}>
        <p>
          The model is never asked for a price. It names a product on that shelf and a count; the price comes from the
          owner&apos;s catalogue and the total is added up in code, to the cent.
        </p>
      </Cell>

      <Cell area="fix" title="You can fix the bill" demo={<FixDemo items={items} />}>
        <p>
          The camera can miscount, so the shopper has the last word before paying, and an item put back comes off the
          bill. A corrected bill is shown to the owner as adjusted, with what the camera saw beside it.
        </p>
      </Cell>

      <Cell area="hold" title="A hold takes only what you took" demo={<HoldDemo items={items} />}>
        <p>
          If the shop asks for a hold, PayPal authorises it first. The server captures the basket total, never more
          than was held, and releases the rest. A hold is also released if the owner settles the visit another way.
        </p>
      </Cell>

      <Cell area="claim" title="Several shoppers, each their own basket" demo={<ClaimDemo items={items} />}>
        <p>
          Nobody is identified. With one shopper checked in, a shelf change goes to their basket. With several, it
          shows on their phones and the first to claim it gets it.
        </p>
      </Cell>

      <Cell area="door" title="A door QR the owner can cancel" demo={<DoorDemo />}>
        <p>
          The door QR checks a shopper in and gives their phone a basket link with a random id. It has no expiry, so
          the owner can make a new one at any time, and the old one stops working.
        </p>
      </Cell>

      <Cell area="paypal" title="PayPal handles the money" demo={<OrderDemo items={items} />}>
        <p>
          Each bill becomes an itemised PayPal order, and payments, holds and refunds go through PayPal. Shopsitter
          never sees a card number. Every authorise, capture, release and refund is written to the visit&apos;s money
          trail.
        </p>
      </Cell>

      <Cell area="photos" title="Two photos per change, for the owner’s eyes" demo={<PhotosDemo />}>
        <p>
          When a shelf changes, its camera stores the photo from before and the one from after, so a bill can be
          checked against the shelf. The close-up sent with them is not kept.
        </p>
      </Cell>
    </ul>
  );
}
