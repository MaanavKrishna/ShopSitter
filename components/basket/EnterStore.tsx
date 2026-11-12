"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertGlyph, SearchGlyph } from "@/components/pay/glyphs";
import { doorTokenFromHash, enterProblem } from "@/lib/basket-view";
import { formatCents } from "@/lib/money";
import { checkIn, peekStore } from "./api";
import { rememberHold } from "./hold-store";

type State =
  | { step: "starting" }
  | { step: "no_link" }
  | { step: "problem"; text: string }
  /** The store lets the shopper choose how to pay: asked before checking in. */
  | { step: "choose"; holdCents: number | null };

/**
 * Checks a shopper in from the door code. The token arrives after the "#", is taken off the
 * address bar at once, and is swapped for a basket of the shopper's own.
 */
export function EnterStore() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "starting" });
  // Kept for "Try again" only: the address no longer holds it.
  const token = useRef<string | null>(null);
  const started = useRef(false);

  const enter = useCallback(
    async (hold?: boolean) => {
      const store = token.current;
      if (!store) return setState({ step: "no_link" });
      setState({ step: "starting" });
      const answer = await checkIn(store, hold);
      if (!answer.ok) return setState({ step: "problem", text: enterProblem(answer.status, answer.error) });
      const { sessionId, hold: order } = answer.data;
      if (order?.orderId) rememberHold(sessionId, order.orderId);
      router.replace(`/basket/${encodeURIComponent(sessionId)}`);
    },
    [router],
  );

  const start = useCallback(async () => {
    const store = token.current;
    if (!store) return setState({ step: "no_link" });
    setState({ step: "starting" });
    // A store that lets the shopper choose is asked first, so the choice comes before the basket.
    const peek = await peekStore(store);
    if (!peek.ok) return setState({ step: "problem", text: enterProblem(peek.status, peek.error) });
    if (peek.data.payMode === "choice") return setState({ step: "choose", holdCents: peek.data.holdCents });
    await enter();
  }, [enter]);

  useEffect(() => {
    // One check-in per visit to this page, even when effects run twice in development.
    if (started.current) return;
    started.current = true;
    token.current = doorTokenFromHash(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => void start());
  }, [start]);

  // A door code scanned while this page is already open only changes the part after the "#".
  useEffect(() => {
    const onHash = () => {
      const fresh = doorTokenFromHash(window.location.hash);
      if (!fresh) return;
      token.current = fresh;
      window.history.replaceState(null, "", window.location.pathname);
      void start();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [start]);

  if (state.step === "starting") {
    return (
      <section className="payx-content bk-enter" aria-busy="true">
        <div className="payx-intro">
          <h1 className="payx-title">Starting your basket</h1>
          <p className="payx-lede">One moment.</p>
        </div>
        <Skeleton height={52} />
        <Skeleton height={52} index={1} />
      </section>
    );
  }

  if (state.step === "choose") {
    const amount = state.holdCents !== null ? `$${formatCents(state.holdCents)}` : null;
    return (
      <section className="payx-content bk-enter payx-rise">
        <div className="payx-intro">
          <h1 className="payx-title">How would you like to pay?</h1>
          <p className="payx-lede">Pick one to start your basket.</p>
        </div>
        <div className="bk-choices">
          <button type="button" className="bk-choice bk-choice-hold ds-press" onClick={() => void enter(true)}>
            <strong>Hold with PayPal: walk out when you&apos;re done</strong>
            <span>
              {amount
                ? `PayPal sets aside up to ${amount}. You're charged only for what you take, and the rest is released.`
                : "PayPal sets an amount aside. You're charged only for what you take."}
            </span>
          </button>
          <button type="button" className="bk-choice ds-press" onClick={() => void enter(false)}>
            <strong>Pay at the end</strong>
            <span>Shop first, then pay for your basket with PayPal before you leave.</span>
          </button>
        </div>
      </section>
    );
  }

  const missing = state.step === "no_link";
  return (
    <section className="payx-content payx-quiet payx-rise" role="alert">
      <span className="payx-quiet-mark" aria-hidden="true">
        {missing ? <SearchGlyph /> : <AlertGlyph />}
      </span>
      <h1 className="payx-quiet-title">{missing ? "Scan the code on the door" : "Your basket didn't start"}</h1>
      <p className="payx-quiet-text">
        {missing ? "This page opens from the door code. Scan it with your phone's camera to start a basket." : state.text}
      </p>
      {!missing && (
        <button type="button" className="bk-again ds-press" onClick={() => void start()}>
          Try again
        </button>
      )}
    </section>
  );
}
