"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import { PayPalProvider, usePayPalOneTimePaymentSession } from "@paypal/react-paypal-js/sdk-v6";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState, type ReactNode } from "react";
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
import { easeOut, spring } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { Line, PricedBill, Product } from "@/lib/types";
import type { Visit } from "@/lib/visits";
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

/** Below this the shelf read is shaky enough to ask the customer to double-check. Matches the stand screen. */
const LOW_CONFIDENCE = 0.6;

const MESSAGES: Record<string, string> = {
  empty_bill: "There's nothing on this bill to pay for.",
  already_paid: "This bill is already paid.",
  too_late: "This bill is more than a day old and can't be paid here any more.",
  amount_mismatch: "The bill changed while you were paying. Nothing was charged. Check the new total and pay again.",
  not_editable: "This bill can't be changed any more.",
};
const explain = (code: string) => MESSAGES[code] ?? "Something went wrong and nothing was charged. Try again.";

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
  const [notice, setNotice] = useState<string | null>(null);
  // With nothing read from the shelf, the list of things to add is the whole job, so it sits in the page.
  const [inlineAdd] = useState(initialVisit.needsManual && initialBill.lines.length === 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingSku, setPendingSku] = useState<string | null>(null);
  // Set when the payment happens on this page, so the receipt plays its entrance once.
  const [justPaid, setJustPaid] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/visits/${visitId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setVisit(data.visit);
    setBill(data.bill);
  }, [visitId]);

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
      const data = await res.json();
      if (!res.ok) {
        setNotice(explain(data.error));
        // The message lives in the pay bar, behind the sheet.
        setSheetOpen(false);
      } else {
        setBill(data.bill);
        setVisit(data.visit);
      }
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
              <h1 className="payx-title">Your bill</h1>
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
                    <Note tone="error" icon={<AlertGlyph />} title="Payment problem.">
                      {notice}
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
                        setNotice(explain(code));
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
}: {
  visitId: string;
  totalCents: number;
  disabled: boolean;
  onPaid: (visit: Visit) => void;
  onProblem: (code: string) => void;
}) {
  const [working, setWorking] = useState(false);

  const { isPending, error, handleClick } = usePayPalOneTimePaymentSession({
    presentationMode: "auto",
    // Returned un-awaited to the SDK so the browser still treats the tap as a user action.
    createOrder: async () => {
      const res = await fetch(`/api/visits/${visitId}/order`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        onProblem(data.error);
        throw new Error(data.error);
      }
      return { orderId: data.orderId as string };
    },
    onApprove: async ({ orderId }) => {
      const res = await fetch(`/api/visits/${visitId}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      setWorking(false);
      if (res.ok) onPaid(data.visit);
      else onProblem(data.error);
    },
    onCancel: () => setWorking(false),
    onError: () => {
      setWorking(false);
      onProblem("paypal_error");
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
        setWorking(true);
        void handleClick();
      }}
    >
      {isPending ? "Loading PayPal…" : working ? "Waiting for PayPal…" : `Pay $${formatCents(totalCents)} with PayPal`}
    </button>
  );
}
