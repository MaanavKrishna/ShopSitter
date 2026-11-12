"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import { PayPalProvider, usePayPalOneTimePaymentSession } from "@paypal/react-paypal-js/sdk-v6";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AddSheet } from "@/components/pay/AddSheet";
import { AlertGlyph, CheckGlyph, InfoGlyph, LookGlyph, MinusGlyph, PlusGlyph, SearchGlyph } from "@/components/pay/glyphs";
import { RollingNumber } from "@/components/pay/RollingNumber";
import { basketStage, claimQuestion, holdLimit } from "@/lib/basket-view";
import { formatCents } from "@/lib/money";
import { spring } from "@/lib/motion";
import type { Line } from "@/lib/types";
import { claimPending, confirmHold, finish, getSession, putLines, type DoneResult, type SessionView } from "./api";
import { BasketReceipt } from "./BasketReceipt";
import { forgetHold, heldOrder, hiddenChanges, rememberHidden } from "./hold-store";

/** How often the basket asks what the shelves have seen. */
const POLL_MS = 2000;

const MESSAGES: Record<string, string> = {
  already_claimed: "Someone else already added that to their basket.",
  not_editable: "This basket can't be changed any more.",
  slow_down: "The store is busy right now. Wait a moment and try again.",
  store_busy: "The store is busy right now. Wait a moment and try again.",
  hold_required: "Approve the hold first, then your basket can fill.",
  session_closed: "This basket is closed. Scan the code on the door to start a new one.",
  not_found: "That shelf change is no longer waiting.",
  hold_declined: "PayPal didn't approve the hold. Nothing was held. Try again.",
  hold_mismatch: "That approval doesn't belong to this basket. Scan the code on the door again.",
  paypal_unavailable: "PayPal couldn't be reached. Nothing was charged. Try again in a moment.",
  held_but_unrecorded: "PayPal set the hold aside but the store couldn't record it. Ask the owner before you shop.",
  captured_but_unrecorded: "PayPal took the payment but the store couldn't record it. Check your PayPal activity before paying again.",
  paypal_error: "PayPal couldn't finish that. Nothing was charged. Try again.",
  paypal_refused: "PayPal didn't accept that. Nothing was charged. Try again.",
};
const explain = (code: string | undefined, fallback: string) => (code && MESSAGES[code]) || fallback;

const EDIT_FAILED = "Couldn't update the basket. Check your connection and try again.";
const DONE_FAILED = "Couldn't finish just now. Nothing was charged. Try again.";
const DONE_UNCONFIRMED = "We couldn't confirm that. Wait a moment: this page checks again by itself.";
const HOLD_FAILED = "The hold wasn't set up. Nothing was held. Try again.";
const HOLD_UNCONFIRMED = "We couldn't confirm the hold. Wait a moment: this page checks again by itself.";

type Tone = "info" | "look" | "error";
type Notice = { title: string; text: string };

/** A calm inline note in the pay page's style: small icon, a title, one or two sentences. */
function Note({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="payx-note" data-tone={tone}>
      <span className="payx-note-icon">{icon}</span>
      <p className="payx-note-text">
        <strong>{title}</strong> {children}
      </p>
    </div>
  );
}

function QuietState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="payx-content payx-quiet payx-rise">
      <span className="payx-quiet-mark" aria-hidden="true">
        {icon}
      </span>
      <h1 className="payx-quiet-title">{title}</h1>
      <p className="payx-quiet-text">{children}</p>
    </section>
  );
}

/** The shopper's live basket: it fills as the shelves are read, and Done settles it. */
export function Basket({ sessionId, paypalClientId }: { sessionId: string; paypalClientId: string | null }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [view, setView] = useState<SessionView | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingSku, setPendingSku] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [holdOrder, setHoldOrder] = useState<string | null>(null);
  const [done, setDone] = useState<DoneResult | null>(null);
  /** Done was pressed on an empty basket with nothing held: there is nothing to pay. */
  const [leftEmpty, setLeftEmpty] = useState(false);

  // Only the newest answer may redraw the basket, and never one that was asked before a change was sent.
  const latest = useRef(0);
  const changing = useRef(false);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    const answer = await getSession(sessionId);
    if (mine !== latest.current || changing.current) return;
    if (answer.ok) {
      setView(answer.data);
      setOffline(false);
    } else if (answer.status === 404) setMissing(true);
    else if (answer.status === null) setOffline(true);
  }, [sessionId]);

  useEffect(() => {
    // Known only in the browser: what this tab kept from check-in, and what the shopper waved away.
    queueMicrotask(() => {
      setHoldOrder(heldOrder(sessionId));
      setHidden(hiddenChanges(sessionId));
    });
  }, [sessionId]);

  const orderToApprove = view?.holdOrder?.orderId ?? holdOrder;
  const stage = view ? basketStage(view, orderToApprove !== null) : null;
  const settled = missing || done !== null || leftEmpty || stage === "paid" || stage === "closed" || stage === "pay";
  const payLink = stage === "pay" ? (view?.payLink ?? null) : null;

  // Finished without a hold: the pay page takes over.
  useEffect(() => {
    if (payLink) router.replace(payLink);
  }, [payLink, router]);

  // The shelves may report at any moment: look every two seconds while the page is in view.
  useEffect(() => {
    if (settled) return;
    const look = () => {
      if (document.visibilityState === "visible") void load();
    };
    look();
    const timer = setInterval(look, POLL_MS);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [load, settled]);

  /** Runs one change to the basket, holding back any poll that was already on its way. */
  async function change<T>(work: () => Promise<T>): Promise<T> {
    changing.current = true;
    latest.current++;
    setBusy(true);
    setNotice(null);
    try {
      return await work();
    } finally {
      changing.current = false;
      setBusy(false);
      void load();
    }
  }

  async function setQty(sku: string, qty: number) {
    if (busy || !view) return;
    const current: Line[] = view.bill.lines.map((l) => ({ sku: l.sku, qty: l.qty }));
    const next = current.some((l) => l.sku === sku)
      ? current.map((l) => (l.sku === sku ? { ...l, qty } : l))
      : [...current, { sku, qty }];
    setPendingSku(sku);
    const answer = await change(() => putLines(sessionId, next.filter((l) => l.qty > 0)));
    setPendingSku(null);
    if (answer.ok) {
      const { bill } = answer.data;
      if (bill) setView((v) => (v ? { ...v, bill } : v));
    } else {
      setSheetOpen(false);
      setNotice({ title: "Basket not updated.", text: explain(answer.error, EDIT_FAILED) });
    }
  }

  async function claim(pendingId: string) {
    if (busy) return;
    setClaiming(pendingId);
    const answer = await change(() => claimPending(sessionId, pendingId));
    setClaiming(null);
    if (answer.ok || answer.error === "already_claimed" || answer.status === 404) hide(pendingId);
    if (answer.ok && answer.data.bill) {
      const { bill } = answer.data;
      setView((v) => (v ? { ...v, bill } : v));
    }
    if (!answer.ok) {
      setNotice({
        title: answer.error === "already_claimed" ? "Already taken." : "Not added.",
        text: explain(answer.error, EDIT_FAILED),
      });
    }
  }

  function hide(pendingId: string) {
    setHidden((was) => {
      const next = was.includes(pendingId) ? was : [...was, pendingId];
      rememberHidden(sessionId, next);
      return next;
    });
  }

  async function finishUp() {
    if (busy || !view) return;
    const empty = view.bill.totalCents === 0;
    setFinishing(true);
    const answer = await change(() => finish(sessionId));
    setFinishing(false);
    if (!answer.ok) {
      // With a hold, a lost answer may still have charged it: the page says only that, and looks again.
      const unsure = view.hold !== null && (answer.status === null || answer.status >= 500) && !answer.error;
      setNotice({
        title: unsure ? "Not confirmed." : "Not finished.",
        text: unsure ? DONE_UNCONFIRMED : explain(answer.error, DONE_FAILED),
      });
      return;
    }
    if (answer.data.status === "paid") {
      forgetHold(sessionId);
      setDone(answer.data);
    } else if (answer.data.status === "closed" || empty) setLeftEmpty(true);
    else router.replace(answer.data.payLink);
  }

  if (missing) {
    return (
      <QuietState icon={<SearchGlyph />} title="We can't find this basket">
        Scan the code on the door to start a new one.
      </QuietState>
    );
  }

  if (done?.status === "paid") {
    return <BasketReceipt bill={done.receipt} paidCents={done.paidCents} holdCents={view?.hold?.cents ?? null} payRest={done.payRest} celebrate />;
  }

  if (leftEmpty) {
    return (
      <QuietState icon={<CheckGlyph />} title="Nothing to pay">
        Your basket was empty, so it is closed. Scan the code on the door to start a new one.
      </QuietState>
    );
  }

  if (!view || !stage) return <BasketSkeleton offline={offline} />;

  if (stage === "paid") {
    return (
      <BasketReceipt
        bill={view.bill}
        paidCents={view.paidCents ?? null}
        holdCents={view.hold?.cents ?? null}
        payRest={view.payRest ?? null}
        celebrate={false}
      />
    );
  }

  if (stage === "pay") {
    return (
      <QuietState icon={<CheckGlyph />} title="Taking you to your bill">
        {view.payLink ? <a href={view.payLink}>Open your bill</a> : "Scan the code on the stand to pay."}
      </QuietState>
    );
  }

  if (stage === "closed") {
    return (
      <QuietState icon={<CheckGlyph />} title="This basket is closed">
        {view.bill.totalCents > 0
          ? "If something is still to pay, scan the code on the stand. To shop again, scan the code on the door."
          : "To shop again, scan the code on the door."}
      </QuietState>
    );
  }

  if (stage === "hold") {
    const cents = view.holdOrder?.cents ?? view.hold?.cents ?? null;
    return (
      <div className="payx-view">
        <section className="payx-content">
          <div className="payx-intro payx-rise">
            <h1 className="payx-title">Before you shop</h1>
            <p className="payx-lede bk-hold-lede">
              {cents !== null ? `We hold $${formatCents(cents)}. ` : "We place a hold with PayPal. "}
              You&apos;re charged only for what you take; the rest is released.
            </p>
          </div>
          <ol className="bk-steps payx-rise">
            <li>
              <b>Approve the hold</b>
              <span>PayPal sets the amount aside. Nothing is charged yet.</span>
            </li>
            <li>
              <b>Take what you like</b>
              <span>Your basket fills on this page as the shelves are read.</span>
            </li>
            <li>
              <b>Tap Done</b>
              <span>You pay for what you took, and the rest of the hold is released.</span>
            </li>
          </ol>
          <p className="payx-small payx-sandbox payx-rise">Holds go through the PayPal sandbox. No real money moves.</p>
        </section>
        <div className="payx-bar">
          <div className="payx-bar-in">
            {notice && (
              <div role="alert">
                <Note tone="error" icon={<AlertGlyph />} title={notice.title}>
                  {notice.text}
                </Note>
              </div>
            )}
            {cents !== null && (
              <div className="payx-total">
                <span className="payx-total-label">Hold</span>
                <span className="num payx-total-amount payx-money">${formatCents(cents)}</span>
              </div>
            )}
            {!orderToApprove ? (
              <Note tone="look" icon={<LookGlyph />} title="Scan the door code again.">
                This page can&apos;t set up the hold any more. A fresh scan starts a new basket.
              </Note>
            ) : paypalClientId ? (
              <div className="payx-paybox">
                <PayPalProvider clientId={paypalClientId} environment="sandbox" components={["paypal-payments"]} pageType="checkout">
                  <HoldButton
                    sessionId={sessionId}
                    orderId={orderToApprove}
                    cents={cents}
                    onHeld={() => {
                      forgetHold(sessionId);
                      setHoldOrder(null);
                      setNotice(null);
                      void load();
                    }}
                    onProblem={(title, text) => {
                      setNotice({ title, text });
                      void load();
                    }}
                  />
                </PayPalProvider>
              </div>
            ) : (
              <div role="alert">
                <Note tone="error" icon={<AlertGlyph />} title="PayPal isn't set up.">
                  PayPal isn&apos;t set up in this store yet, so it can&apos;t place a hold.
                </Note>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { bill } = view;
  const hold = view.hold?.status === "authorized" ? view.hold : null;
  const limit = holdLimit(bill.totalCents, hold?.cents ?? null);
  const waiting = view.pending.filter((p) => !hidden.includes(p.id));
  const onBill = new Set(bill.lines.map((l) => l.sku));
  const canAdd = view.products.some((p) => !onBill.has(p.sku));
  const empty = bill.lines.length === 0;

  return (
    <div className="payx-view">
      <section className="payx-content">
        <div className="payx-intro payx-rise">
          <h1 className="payx-title" tabIndex={-1}>
            Your basket
          </h1>
          <p className="bk-live" role="status">
            <i aria-hidden="true" data-off={offline || undefined} />
            {offline ? "Trying to reach the store…" : "Filling as the shelves are read"}
          </p>
        </div>

        {hold && (
          <p className="bk-holdline payx-rise">
            <span>
              <span className="num">${formatCents(hold.cents)}</span> held with PayPal
            </span>
            <span>Charged only for what you take</span>
          </p>
        )}

        <AnimatePresence initial={false}>
          {limit !== "under" && hold && (
            <motion.div key="limit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
              <Note tone="info" icon={<InfoGlyph />} title={limit === "over" ? "Over your hold." : "Close to your hold."}>
                {limit === "over"
                  ? `Your basket is more than the $${formatCents(hold.cents)} held. When you tap Done, the hold pays for what fits and you pay the rest on the next screen.`
                  : `Your basket is close to the $${formatCents(hold.cents)} held. Anything above it is paid separately when you tap Done.`}
              </Note>
            </motion.div>
          )}
        </AnimatePresence>

        {waiting.length > 0 && (
          <ul className="bk-claims" aria-label="Shelf changes to check">
            <AnimatePresence initial={false} mode="popLayout">
              {waiting.map((p) => (
                <motion.li
                  key={p.id}
                  layout="position"
                  className="bk-claim"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={spring}
                >
                  <p className="bk-claim-q">{claimQuestion(p)}</p>
                  {p.totalCents > 0 && <p className="bk-claim-sum num">${formatCents(p.totalCents)}</p>}
                  <div className="bk-claim-actions">
                    <button
                      type="button"
                      className="bk-claim-yes ds-press"
                      disabled={busy}
                      aria-busy={claiming === p.id || undefined}
                      onClick={() => void claim(p.id)}
                    >
                      {claiming === p.id ? "Adding…" : "Yes, mine"}
                    </button>
                    <button type="button" className="bk-claim-no ds-press" disabled={claiming === p.id} onClick={() => hide(p.id)}>
                      Not mine
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <ul className="payx-lines payx-rise" data-pending={busy || undefined}>
          <AnimatePresence initial={false} mode="popLayout">
            {bill.lines.map((l) => (
              <motion.li
                key={l.sku}
                layout="position"
                className="payx-line"
                data-sku={l.sku}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: 0.08 } }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                transition={spring}
              >
                <div className="payx-line-what">
                  <span className="payx-line-name">{l.name}</span>
                  <span className="payx-line-each">${formatCents(l.unitCents)} each</span>
                </div>
                <div className="payx-stepper">
                  <button
                    type="button"
                    className="payx-step ds-press"
                    aria-label={`One fewer ${l.name}`}
                    aria-disabled={busy || undefined}
                    onClick={() => void setQty(l.sku, l.qty - 1)}
                  >
                    <MinusGlyph />
                  </button>
                  <RollingNumber className="num payx-qty" value={l.qty} text={String(l.qty)} label={`${l.qty} ${l.name}`} />
                  <button
                    type="button"
                    className="payx-step ds-press"
                    aria-label={`One more ${l.name}`}
                    disabled={l.qty >= 20}
                    aria-disabled={busy || undefined}
                    onClick={() => void setQty(l.sku, l.qty + 1)}
                  >
                    <PlusGlyph />
                  </button>
                </div>
                <RollingNumber className="num payx-line-total payx-money" value={l.lineCents} text={`$${formatCents(l.lineCents)}`} />
              </motion.li>
            ))}
            {empty && (
              <motion.li
                key="nothing-yet"
                layout="position"
                className="payx-empty bk-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <b>Take what you like.</b>
                <span>Your basket fills as the shelves are read.</span>
              </motion.li>
            )}
          </AnimatePresence>
        </ul>

        {canAdd && (
          <motion.div layout="position" transition={spring} className="payx-adder payx-rise">
            <button type="button" className="payx-addbtn ds-press" onClick={() => setSheetOpen(true)}>
              <span className="payx-addbtn-mark">
                <PlusGlyph />
              </span>
              I took something that isn&apos;t listed
            </button>
          </motion.div>
        )}

        <motion.p layout="position" transition={spring} className="payx-small payx-sandbox payx-rise">
          Payments go through the PayPal sandbox. No real money moves.
        </motion.p>
      </section>

      <div className="payx-bar">
        <div className="payx-bar-in">
          <AnimatePresence initial={false}>
            {notice && (
              <motion.div key="notice" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <Note tone="error" icon={<AlertGlyph />} title={notice.title}>
                  {notice.text}
                </Note>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="payx-total" data-pending={busy || undefined}>
            <span className="payx-total-label">
              Total so far
              <span className="sr-only" role="status">
                {busy ? "Updating the basket" : ""}
              </span>
            </span>
            <RollingNumber className="num payx-total-amount payx-money" value={bill.totalCents} text={`$${formatCents(bill.totalCents)}`} />
          </div>

          <button
            type="button"
            className="bk-done ds-press"
            disabled={busy}
            aria-busy={finishing || undefined}
            onClick={() => void finishUp()}
          >
            {finishing ? "Finishing…" : "Done"}
          </button>
          <p className="payx-small bk-done-hint">
            {hold
              ? empty
                ? "Taking nothing? Tap Done and the hold is released."
                : limit === "over"
                  ? "Done charges your hold for what fits. You pay the rest next."
                  : "Done charges this total to your hold and releases the rest."
              : empty
                ? "Tap Done when you've finished."
                : "Done takes you to PayPal to pay this total."}
          </p>
        </div>
      </div>

      <AddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        products={view.products}
        onBill={onBill}
        pendingSku={pendingSku}
        busy={busy}
        onAdd={(sku) => void setQty(sku, 1)}
      />
    </div>
  );
}

/** Placeholder in the shape of the basket while the first answer loads. */
function BasketSkeleton({ offline }: { offline: boolean }) {
  return (
    <div className="payx-view" aria-busy="true">
      <section className="payx-content">
        <div className="payx-intro">
          <Skeleton width={170} height={34} />
          <Skeleton width="70%" height={18} index={1} />
        </div>
        <Skeleton height={76} index={2} />
        <p className="payx-small payx-sandbox">{offline ? "Trying to reach the store…" : "Loading your basket"}</p>
      </section>
      <div className="payx-bar">
        <div className="payx-bar-in">
          <div className="payx-total">
            <Skeleton width={92} height={16} index={3} />
            <Skeleton width={120} height={34} index={3} />
          </div>
          <Skeleton height={56} index={4} />
        </div>
      </div>
    </div>
  );
}

/**
 * Approves the hold. The PayPal order was made by the server at check-in for the amount it worked
 * out; this button only lets the shopper approve it, then tells the server to place the hold.
 */
function HoldButton({
  sessionId,
  orderId,
  cents,
  onHeld,
  onProblem,
}: {
  sessionId: string;
  orderId: string;
  cents: number | null;
  onHeld: () => void;
  onProblem: (title: string, text: string) => void;
}) {
  const [working, setWorking] = useState(false);
  // Set when a step has already told the shopper what happened, so the SDK's own error does not replace it.
  const told = useRef(false);

  const { isPending, error, handleClick } = usePayPalOneTimePaymentSession({
    presentationMode: "auto",
    createOrder: async () => ({ orderId }),
    onApprove: async ({ orderId: approved }) => {
      const answer = await confirmHold(sessionId, approved);
      setWorking(false);
      told.current = true;
      if (answer.ok) onHeld();
      else if (answer.status === null || answer.status >= 500) onProblem("Hold not confirmed.", HOLD_UNCONFIRMED);
      else onProblem("Hold not set up.", explain(answer.error, HOLD_FAILED));
    },
    onCancel: () => {
      setWorking(false);
      onProblem("Hold not approved.", "Nothing was held. Approve the hold to start your basket.");
    },
    onError: () => {
      setWorking(false);
      if (!told.current) onProblem("Hold not set up.", "PayPal couldn't set up the hold. Nothing was held. Try again.");
    },
  });

  if (error) {
    return (
      <div role="alert">
        <Note tone="error" icon={<AlertGlyph />} title="PayPal couldn't load.">
          Check your connection and reload this page.
        </Note>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-paypal btn-pay"
      disabled={isPending || working}
      onClick={() => {
        told.current = false;
        setWorking(true);
        void Promise.resolve(handleClick()).catch(() => {});
      }}
    >
      {isPending
        ? "Loading PayPal…"
        : working
          ? "Waiting for PayPal…"
          : cents !== null
            ? `Hold $${formatCents(cents)} with PayPal`
            : "Approve the hold with PayPal"}
    </button>
  );
}
