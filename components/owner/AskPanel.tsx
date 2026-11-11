"use client";

import { IconArrowUp, IconBrandPaypal, IconMessageQuestion, IconNotes, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Source } from "@/lib/ask";
import { easeOut, spring } from "@/lib/motion";
import { ownerSignedOut, useOwner } from "./OwnerProvider";

const SUGGESTED = ["What sold best?", "What is still unmatched?", "How much did I refund?"];
const MAX_QUESTION = 300;
/** Visits linked under an answer; the rest are in Visits. */
const MAX_VISIT_CHIPS = 4;

const briefLabel = (days: number) => (days === 1 ? "Last 24 hours in brief" : days === 7 ? "This week in brief" : `${days} days in brief`);

type Shown =
  | { state: "idle" }
  | { state: "reading"; title: string }
  | { state: "answer"; title: string; answer: string; sources: Source[]; checked: boolean; span: string }
  | { state: "problem"; title: string; message: string; limited: boolean };

type Reply = { answer?: string; sources?: Source[]; checked?: boolean; error?: string; message?: string };

function typingOrDialog(target: EventTarget | null): boolean {
  if (document.querySelector("dialog[open], [role='dialog']:not(dialog)")) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [role='textbox'], [role='combobox']") !== null;
}

/** A command bar on the overview: a question about the stand in plain words, or its brief, answered from the stand's records. */
export function AskPanel() {
  const { dataDays, period } = useOwner();
  const reduced = useReducedMotion();
  const [question, setQuestion] = useState("");
  const [shown, setShown] = useState<Shown>({ state: "idle" });
  const input = useRef<HTMLInputElement>(null);
  // Only the newest request may fill the answer area.
  const latest = useRef(0);
  const running = useRef<AbortController | null>(null);

  // "a" puts the cursor in the bar. It waits a tick so "g then a" (go to Sales) wins when that is what was typed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "a" || e.metaKey || e.ctrlKey || e.altKey || e.repeat || typingOrDialog(e.target)) return;
      setTimeout(() => {
        if (!e.defaultPrevented) input.current?.focus();
      }, 0);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => running.current?.abort(), []);

  async function send(body: { question: string } | { brief: true }, title: string) {
    running.current?.abort();
    const control = new AbortController();
    running.current = control;
    const request = ++latest.current;
    setShown({ state: "reading", title });
    const span = period.subtitle;

    let next: Shown;
    try {
      const res = await fetch("/api/owner/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, days: dataDays, tzOffset: new Date().getTimezoneOffset() }),
        signal: control.signal,
      });
      if (res.status === 401) {
        ownerSignedOut();
        return;
      }
      const reply: Reply = await res.json().catch(() => ({}));
      next =
        res.ok && reply.answer
          ? { state: "answer", title, answer: reply.answer, sources: reply.sources ?? [], checked: reply.checked !== false, span }
          : {
              state: "problem",
              title,
              message: reply.message ?? "That did not work. Nothing was changed.",
              limited: res.status === 429,
            };
    } catch {
      if (control.signal.aborted) return;
      next = { state: "problem", title, message: "The stand could not be reached. Check the connection and try again.", limited: false };
    }
    if (request === latest.current) setShown(next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (text) void send({ question: text }, text);
  }

  function close() {
    running.current?.abort();
    latest.current++;
    setShown({ state: "idle" });
  }

  const reading = shown.state === "reading";
  const visits = shown.state === "answer" ? shown.sources.filter((s) => s.kind === "visit" && s.id).slice(0, MAX_VISIT_CHIPS) : [];
  const others = shown.state === "answer" ? shown.sources.filter((s) => s.kind !== "visit" && s.kind !== "paypal") : [];
  const paypal = shown.state === "answer" && shown.sources.some((s) => s.kind === "paypal");

  return (
    <section className="ow-ask" aria-label="Ask about this stand">
      <form className="ow-ask-bar" onSubmit={onSubmit}>
        <IconMessageQuestion size={18} aria-hidden="true" />
        <input
          ref={input}
          type="text"
          value={question}
          maxLength={MAX_QUESTION}
          placeholder="Ask about this stand"
          aria-label="Ask about this stand"
          aria-keyshortcuts="a"
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
        />
        <kbd className="ow-ask-key" aria-hidden="true">
          A
        </kbd>
        <button type="submit" className="ow-ask-send ds-press" aria-label="Ask" disabled={reading || question.trim() === ""}>
          <IconArrowUp size={16} aria-hidden="true" />
        </button>
      </form>

      <div className="ow-ask-chips">
        {SUGGESTED.map((text) => (
          <button
            key={text}
            type="button"
            className="ow-ask-chip ds-press"
            disabled={reading}
            onClick={() => {
              setQuestion(text);
              void send({ question: text }, text);
            }}
          >
            {text}
          </button>
        ))}
        <button
          type="button"
          className="ow-ask-chip ow-ask-brief ds-press"
          disabled={reading}
          onClick={() => void send({ brief: true }, briefLabel(dataDays))}
        >
          <IconNotes size={15} aria-hidden="true" />
          {briefLabel(dataDays)}
        </button>
      </div>

      <div aria-live="polite" aria-busy={reading || undefined}>
        <AnimatePresence mode="wait" initial={false}>
          {shown.state !== "idle" && (
            <motion.div
              key="out"
              className="ow-ask-out"
              data-state={shown.state}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.16, ease: easeOut }}
            >
              <div className="ow-ask-head">
                <p className="ow-ask-title">{shown.title}</p>
                <button type="button" className="ow-ask-close ds-press" aria-label="Close the answer" onClick={close}>
                  <IconX size={15} aria-hidden="true" />
                </button>
              </div>

              {shown.state === "reading" && (
                <div className="ow-ask-reading">
                  <span>Reading the books</span>
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                </div>
              )}

              {shown.state === "problem" && (
                <motion.p
                  key="problem"
                  className="ow-ask-problem"
                  data-limited={shown.limited || undefined}
                  role="alert"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {shown.message}
                </motion.p>
              )}

              {shown.state === "answer" && (
                // The answer materialises in place of the placeholder: it sharpens and rises as it arrives.
                <motion.div
                  key="answer"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(6px)" }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={spring}
                >
                  <p className="ow-ask-answer">{shown.answer}</p>
                  <div className="ow-ask-facts">
                    <span className="ow-ask-from">
                      {shown.checked ? "From" : "Shown as recorded, from"} {shown.span.toLowerCase()}
                    </span>
                    {others.map((s) => (
                      <span key={s.kind} className="ow-ask-fact">
                        {s.label}
                      </span>
                    ))}
                    {visits.map((s) => (
                      <Link key={s.id} href={`/owner/visits/${s.id}`} className="ow-ask-fact" data-link>
                        {s.label}
                      </Link>
                    ))}
                    {paypal && (
                      <span className="ow-ask-fact" data-tone="paypal">
                        <IconBrandPaypal size={13} aria-hidden="true" />
                        PayPal sandbox
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
