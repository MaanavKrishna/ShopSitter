"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import { PayPalProvider, usePayPalOneTimePaymentSession } from "@paypal/react-paypal-js/sdk-v6";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AddList, AddSheet } from "@/components/pay/AddSheet";
import {
  AlertGlyph,
  CheckGlyph,
  ClockGlyph,
  InfoGlyph,
  ListGlyph,
  LookGlyph,
  MinusGlyph,
  PlusGlyph,
  SearchGlyph,
} from "@/components/pay/glyphs";
import { Receipt } from "@/components/pay/Receipt";
import { RollingNumber } from "@/components/pay/RollingNumber";
import { captureOutcome, focusAfterRemoval, readJson } from "@/lib/client-retry";
import { easeOut, spring } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { publicBill } from "@/lib/checkout";
import type { Line, PricedBill } from "@/lib/types";

// The pay page is public, so it works from the trimmed record the server shares, not the stored one.
type Visit = ReturnType<typeof publicBill>["visit"];
type Product = ReturnType<typeof publicBill>["products"][number];
import "@/app/pay/pay.css";

type Props = {
  visitId: string;
  initialVisit: Visit;
  initialBill: PricedBill;
  products: Product[];
  /** True when the bill is past the late-payment window and the server will refuse it. */
  expired?: boolean;
  paypalClientId: string | null;
};

const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

/** Stands for "the add control" when a removed line leaves no other line to focus. */
const ADD = "\u0000add";

/** Below this the shelf read is shaky enough to ask the customer to double-check. Matches the stand screen. */
const LOW_CONFIDENCE = 0.6;

const MESSAGES: Record<string, string> = {
  empty_bill: "There's nothing on this bill to pay for.",
  already_paid: "This bill is already paid.",
  too_late: "This bill is more than a day old and can't be paid here any more.",
  amount_mismatch: "The bill changed while you were paying. Nothing was charged. Check the new total and pay again.",
  not_editable: "This bill can't be changed any more.",
  use_basket: "This bill belongs to a basket started at the door. Change and pay it from that basket.",
  order_failed: "Couldn't start the payment. Nothing was charged. Check your connection and try again.",
  paypal_error: "PayPal couldn't finish the payment. Try again.",
  slow_down: "The stand is busy right now. Wait a moment and try again.",
};
const EDIT_FAILED = "Couldn't update the bill. Check your connection and try again.";
const UNCONFIRMED = "We couldn't confirm the payment. Check your PayPal activity before paying again.";
const explain = (code: string | undefined) =>
  (code && MESSAGES[code]) || "Something went wrong and nothing was charged. Try again.";

/** What went wrong decides the heading: changing the bill, paying it, or a payment nobody could confirm. */
type Notice = { about: "edit" | "pay" | "unconfirmed"; text: string };
const NOTICE_TITLE: Record<Notice["about"], string> = {
  edit: "Bill not updated.",
  pay: "Payment problem.",
  unconfirmed: "Payment not confirmed.",
};

type Tone = "info" | "look" | "error";

/** A calm inline note: small icon, a title, one or two sentences. */
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

export function PayPanel({ visitId, initialVisit, initialBill, products, expired = false, paypalClientId }: Props) {
  const reduce = useReducedMotion();
  const [visit, setVisit] = useState(initialVisit);
  const [bill, setBill] = useState(initialBill);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // With nothing read from the shelf, the list of things to add is the whole job, so it sits in the page.
  const [inlineAdd] = useState(initialVisit.needsManual && initialBill.lines.length === 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingSku, setPendingSku] = useState<string | null>(null);
  // Set when the payment happens on this page, so the receipt plays its entrance once.
  const [justPaid, setJustPaid] = useState(false);

  const view = useRef<HTMLDivElement>(null);
  // Where focus should land once the bill has redrawn after a line was removed: a sku, or the add control.
  const focusNext = useRef<string | null>(null);

  /** Asks the server for the bill as it stands. Leaves the screen alone when there is no answer. */
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/visits/${visitId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await readJson<{ visit: Visit; bill: PricedBill }>(res);
    if (!data?.visit || !data.bill) return;
    setVisit(data.visit);
    setBill(data.bill);
  }, [visitId]);

  // A removed line takes the focused button with it: hand focus to the next line, or to the add control.
  useEffect(() => {
    const want = focusNext.current;
    if (want === null) return;
    focusNext.current = null;
    const root = view.current;
    const line = want === ADD ? null : root?.querySelector<HTMLElement>(`[data-sku="${CSS.escape(want)}"] .payx-step`);
    (line ?? root?.querySelector<HTMLElement>(".payx-addbtn, .payx-adder .payx-additem") ?? root?.querySelector<HTMLElement>(".payx-title"))?.focus();
  }, [bill]);

  async function setQty(sku: string, qty: number) {
    if (busy) return;
    const current: Line[] = bill.lines.map((l) => ({ sku: l.sku, qty: l.qty }));
    const next = current.some((l) => l.sku === sku)
      ? current.map((l) => (l.sku === sku ? { ...l, qty } : l))
      : [...current, { sku, qty }];
    setBusy(true);
    setPendingSku(sku);
    setNotice(null);
    try {
      const res = await fetch(`/api/visits/${visitId}/lines`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: next.filter((l) => l.qty > 0) }),
      });
      const data = await readJson<{ error?: string; bill?: PricedBill; visit?: Visit }>(res);
      if (res.ok && data?.bill && data.visit) {
        if (qty <= 0) focusNext.current = focusAfterRemoval(current.map((l) => l.sku), sku) ?? ADD;
        setBill(data.bill);
        setVisit(data.visit);
      } else {
        // Nothing was changed on screen ahead of the answer, so the quantities still show what the server holds.
        setNotice({ about: "edit", text: (data?.error && MESSAGES[data.error]) || EDIT_FAILED });
        // The message lives in the pay bar, behind the sheet.
        setSheetOpen(false);
        // A refusal usually means the bill moved on (paid, closed): show it as it is now.
        if (data?.error) void refresh();
      }
    } catch {
      setNotice({ about: "edit", text: EDIT_FAILED });
      setSheetOpen(false);
    } finally {
      setBusy(false);
      setPendingSku(null);
    }
  }

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const paid = isPaid(visit);
  const closed = visit.status === "empty" || visit.status === "settled_other";
  const onBill = new Set(bill.lines.map((l) => l.sku));
  const notOnBill = products.filter((p) => !onBill.has(p.sku));
  const lowConfidence = visit.confidence !== null && visit.confidence < LOW_CONFIDENCE;
  const canAdd = notOnBill.length > 0 && !expired;

  if (closed) {
    return (
      <QuietState icon={<CheckGlyph />} title="Nothing to pay">
        This bill is closed. If you took something, scan the code on the stand again.
      </QuietState>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {paid ? (
        <Receipt
          key="paid"
          bill={bill}
          paidCents={visit.paidCents ?? 0}
          captureId={visit.captureId}
          celebrate={justPaid}
        />
      ) : (
        <motion.div
          key="bill"
          ref={view}
          className="payx-view"
          exit="gone"
          variants={{ gone: { transition: { duration: 0.22 } } }}
        >
          <motion.section
            className="payx-content"
            variants={{ gone: reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(4px)" } }}
            transition={{ duration: 0.22, ease: easeOut }}
          >
            <div className="payx-intro payx-rise">
              <h1 className="payx-title" tabIndex={-1}>
                Your bill
              </h1>
              <p className="payx-lede">
                {visit.needsManual
                  ? "The stand couldn't read the shelf this time. Add what you took."
                  : expired
                    ? "This is what the stand saw you take."
                    : "This is what the stand saw you take. Fix anything that's wrong."}
              </p>
            </div>

            {expired ? (
              <Note tone="look" icon={<ClockGlyph />} title="This bill has expired.">
                It is more than a day old and can&apos;t be paid here any more. Scan the code on the stand to start
                a new one.
              </Note>
            ) : visit.needsManual ? (
              <Note tone="info" icon={<ListGlyph />} title="Shelf not read.">
                Use the list below to add each thing you took, then pay.
              </Note>
            ) : lowConfidence ? (
              <Note tone="look" icon={<LookGlyph />} title="Please check this bill.">
                The stand wasn&apos;t sure about this one. Use the plus and minus buttons to match what you took.
              </Note>
            ) : visit.status === "unmatched" ? (
              <Note tone="info" icon={<InfoGlyph />} title="This bill is still open.">
                It wasn&apos;t paid at the time. You can pay it here now.
              </Note>
            ) : null}

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
                        disabled={expired}
                        aria-disabled={busy || undefined}
                        onClick={() => setQty(l.sku, l.qty - 1)}
                      >
                        <MinusGlyph />
                      </button>
                      <RollingNumber
                        className="num payx-qty"
                        value={l.qty}
                        text={String(l.qty)}
                        label={`${l.qty} ${l.name}`}
                      />
                      <button
                        type="button"
                        className="payx-step ds-press"
                        aria-label={`One more ${l.name}`}
                        disabled={expired || l.qty >= 20}
                        aria-disabled={busy || undefined}
                        onClick={() => setQty(l.sku, l.qty + 1)}
                      >
                        <PlusGlyph />
                      </button>
                    </div>
                    <RollingNumber
                      className="num payx-line-total payx-money"
                      value={l.lineCents}
                      text={`$${formatCents(l.lineCents)}`}
                    />
                  </motion.li>
                ))}
                {bill.lines.length === 0 && (
                  <motion.li
                    key="nothing-yet"
                    layout="position"
                    className="payx-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    Nothing on the bill yet.
                  </motion.li>
                )}
              </AnimatePresence>
            </ul>

            {canAdd && (
              <motion.div layout="position" transition={spring} className="payx-adder payx-rise">
                {inlineAdd ? (
                  <>
                    <h2 className="payx-adder-title">Add what you took</h2>
                    <AddList
                      products={notOnBill}
                      pendingSku={pendingSku}
                      busy={busy}
                      onAdd={(sku) => setQty(sku, 1)}
                    />
                  </>
                ) : (
                  <button type="button" className="payx-addbtn ds-press" onClick={() => setSheetOpen(true)}>
                    <span className="payx-addbtn-mark">
                      <PlusGlyph />
                    </span>
                    I took something that isn&apos;t listed
                  </button>
                )}
              </motion.div>
            )}

            {!expired && (
              <motion.p layout="position" transition={spring} className="payx-small payx-sandbox payx-rise">
                Payments go through the PayPal sandbox. No real money moves.
              </motion.p>
            )}
          </motion.section>

          <motion.div
            className="payx-bar"
            variants={{ gone: reduce ? { opacity: 0 } : { opacity: 0, y: "60%" } }}
            transition={{ duration: 0.22, ease: easeOut }}
          >
            <div className="payx-bar-in">
              <AnimatePresence initial={false}>
                {notice && (
                  <motion.div
                    key="notice"
                    role="alert"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={spring}
                  >
                    <Note tone="error" icon={<AlertGlyph />} title={NOTICE_TITLE[notice.about]}>
                      {notice.text}
                    </Note>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="payx-total" data-pending={busy || undefined}>
                <span className="payx-total-label">
                  {expired ? "Total" : "Total to pay"}
                  <span className="sr-only" role="status">
                    {busy ? "Updating the bill" : ""}
                  </span>
                </span>
                <RollingNumber
                  className="num payx-total-amount payx-money"
                  value={bill.totalCents}
                  text={`$${formatCents(bill.totalCents)}`}
                />
              </div>

              {expired ? (
                <p className="payx-small payx-bar-hint">This bill can&apos;t be paid here any more.</p>
              ) : bill.totalCents === 0 ? (
                <p className="payx-small payx-bar-hint">Add what you took to pay for it.</p>
              ) : paypalClientId ? (
                <div className="payx-paybox">
                  <PayPalProvider
                    clientId={paypalClientId}
                    environment="sandbox"
                    components={["paypal-payments"]}
                    pageType="checkout"
                  >
                    <PayButton
                      visitId={visitId}
                      totalCents={bill.totalCents}
                      disabled={busy}
                      onPaid={(v) => {
                        setJustPaid(true);
                        setVisit(v);
                        setNotice(null);
                      }}
                      onProblem={(code) => {
                        setNotice({ about: "pay", text: explain(code) });
                        void refresh();
                      }}
                      onUnconfirmed={() => {
                        // PayPal may already have taken the money: say so, and look again (it may now be paid).
                        setNotice({ about: "unconfirmed", text: UNCONFIRMED });
                        void refresh();
                      }}
                    />
                  </PayPalProvider>
                </div>
              ) : (
                <div role="alert">
                  <Note tone="error" icon={<AlertGlyph />} title="PayPal isn't set up.">
                    PayPal isn&apos;t set up on this stand yet, so it can&apos;t take payment.
                  </Note>
                </div>
              )}
            </div>
          </motion.div>

          <AddSheet
            open={sheetOpen && !expired}
            onClose={closeSheet}
            products={products}
            onBill={onBill}
            pendingSku={pendingSku}
            busy={busy}
            onAdd={(sku) => setQty(sku, 1)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One quiet message in the sheet: a mark, a heading, one line of guidance. */
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

/** Shown when the link does not match any bill. */
export function PayNotFound() {
  return (
    <QuietState icon={<SearchGlyph />} title="We can't find this bill">
      Scan the code on the stand again to get a fresh link.
    </QuietState>
  );
}

/** Placeholder in the exact shape of the bill sheet and pay bar while the server loads the bill. */
export function PaySkeleton() {
  return (
    <div className="payx-view" aria-busy="true">
      <section className="payx-content">
        <div className="payx-intro">
          <Skeleton width={150} height={34} />
          <Skeleton width="82%" height={18} index={1} />
        </div>
        <div className="payx-lines">
          {[0, 1].map((i) => (
            <div key={i} className="payx-line">
              <div className="payx-line-what">
                <Skeleton width={i ? 120 : 84} height={18} index={i + 2} />
                <Skeleton width={70} height={14} index={i + 2} />
              </div>
              <Skeleton width={128} height={48} radius="rounded" index={i + 2} />
              <Skeleton width={60} height={20} index={i + 2} />
            </div>
          ))}
        </div>
        <div className="payx-adder">
          <Skeleton height={52} index={4} />
        </div>
        <p className="payx-small payx-sandbox">Loading your bill</p>
      </section>
      <div className="payx-bar">
        <div className="payx-bar-in">
          <div className="payx-total">
            <Skeleton width={92} height={16} index={5} />
            <Skeleton width={120} height={34} index={5} />
          </div>
          <Skeleton height={56} index={6} />
        </div>
      </div>
    </div>
  );
}

function PayButton({
  visitId,
  totalCents,
  disabled,
  onPaid,
  onProblem,
  onUnconfirmed,
}: {
  visitId: string;
  totalCents: number;
  disabled: boolean;
  onPaid: (visit: Visit) => void;
  /** The payment was turned down before any money moved. */
  onProblem: (code: string | undefined) => void;
  /** The capture got no clear answer, so the money may have moved. */
  onUnconfirmed: () => void;
}) {
  const [working, setWorking] = useState(false);
  // Set when a step has already told the customer what happened, so the SDK's own error does not replace it.
  const told = useRef(false);

  const { isPending, error, handleClick } = usePayPalOneTimePaymentSession({
    presentationMode: "auto",
    // Returned un-awaited to the SDK so the browser still treats the tap as a user action.
    createOrder: async () => {
      const res = await fetch(`/api/visits/${visitId}/order`, { method: "POST" }).catch(() => null);
      const data = res ? await readJson<{ error?: string; orderId?: string }>(res) : null;
      if (!res?.ok || !data?.orderId) {
        // No order was made, so nothing can have been charged.
        told.current = true;
        onProblem(data?.error ?? "order_failed");
        throw new Error(data?.error ?? "order_failed");
      }
      return { orderId: data.orderId };
    },
    onApprove: async ({ orderId }) => {
      const res = await fetch(`/api/visits/${visitId}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => null);
      const data = res ? await readJson<{ error?: string; visit?: Visit }>(res) : null;
      setWorking(false);
      told.current = true;
      const outcome = captureOutcome(res?.status ?? null, data?.error);
      if (outcome === "paid" && data?.visit) onPaid(data.visit);
      else if (outcome === "refused") onProblem(data?.error);
      else onUnconfirmed();
    },
    onCancel: () => setWorking(false),
    onError: () => {
      setWorking(false);
      if (!told.current) onProblem("paypal_error");
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
      disabled={disabled || isPending || working}
      onClick={() => {
        told.current = false;
        setWorking(true);
        // A failure is reported through onError; this only keeps the rejection from going unhandled.
        void Promise.resolve(handleClick()).catch(() => {});
      }}
    >
      {isPending ? "Loading PayPal…" : working ? "Waiting for PayPal…" : `Pay $${formatCents(totalCents)} with PayPal`}
    </button>
  );
}
