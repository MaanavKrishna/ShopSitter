"use client";

import { IconArrowRight, IconArrowUpRight, IconCamera, IconCheck, IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RollingNumber } from "@/components/pay/RollingNumber";
import type { SessionView } from "@/components/basket/api";
import type { Totals, VisitRow } from "@/lib/owner";
import { formatCents } from "@/lib/money";
import { easeOut, spring, springSnappy } from "@/lib/motion";
import {
  MAX_READS,
  SCRIPT,
  SHELVES,
  SIM_PRODUCTS,
  STEP_NAMES,
  type ShelfKey,
  announce,
  basketChanges,
  explainRead,
  nextStep,
  pictureAfter,
  readProblem,
  setupProblem,
  stepRail,
} from "@/lib/simulator";
import type { BillLine } from "@/lib/types";

type ZoneFig = { zoneId: string | null; takenCents: number; paidCents: number; unmatchedCents: number; visits: number };
type Owner = { totals: Totals; visits: VisitRow[]; byZone: ZoneFig[] };
type Store = { standKey: string; zones: Record<ShelfKey, string>; sessionId: string; reused: boolean };
type Tab = "shelves" | "basket" | "owner";

const SESSION_KEY = "shopsitter-sim-session";
const READS_KEY = "shopsitter-sim-reads";
const STEPS_KEY = "shopsitter-sim-steps";

const money = (cents: number) => `$${formatCents(cents)}`;

async function getJson<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number | null; error?: string }> {
  const res = await fetch(path, { cache: "no-store", ...init }).catch(() => null);
  if (!res) return { ok: false, status: null };
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) return { ok: false, status: res.status, error: body?.error };
  return { ok: true, data: body };
}
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

class SetupError extends Error {
  constructor(public status: number | null, public code?: string) {
    super(code ?? "setup");
  }
}
function must<T>(a: { ok: true; data: T } | { ok: false; status: number | null; error?: string }): T {
  if (!a.ok) throw new SetupError(a.status, a.error);
  return a.data;
}

/** Sets up (or reuses) this browser's trial as the sample store, and checks in one shopper. */
async function openStore(onNote: (n: string) => void): Promise<Store> {
  let reused = false;
  let trial = await getJson<{ standKey: string }>("/api/trial");
  if (trial.ok) {
    reused = true;
    onNote("Using your trial store");
  } else {
    onNote("Starting a sample store");
    trial = await getJson<{ standKey: string }>("/api/trial", jsonInit("POST", {}));
  }
  const { standKey } = must(trial);

  onNote("Putting up two shelves");
  const store = must(await getJson<{ zones: { id: string; name: string; aisle: string; order: number }[] }>("/api/owner/store"));
  const others = store.zones.filter((z) => !SHELVES.some((s) => s.name === z.name));
  const wanted = SHELVES.map((s) => {
    const had = store.zones.find((z) => z.name === s.name);
    return { ...(had ? { id: had.id } : {}), name: s.name, aisle: s.aisle, order: s.order };
  });
  const saved = must(await getJson<{ zones: { id: string; name: string }[] }>("/api/owner/store/zones", jsonInit("PUT", { zones: [...wanted, ...others] })));
  const zones = Object.fromEntries(SHELVES.map((s) => [s.key, saved.zones.find((z) => z.name === s.name)!.id])) as Record<ShelfKey, string>;

  onNote("Stocking six products");
  for (const p of SIM_PRODUCTS) {
    const fields = { sku: p.sku, name: p.name, description: p.description, price: p.price, zoneId: p.shelf ? zones[p.shelf] : null };
    const edit = await getJson("/api/owner/products", jsonInit("PUT", fields));
    if (!edit.ok) must(await getJson("/api/owner/products", jsonInit("PUT", { ...fields, stock: 6, create: true })));
  }

  onNote("Checking in a shopper at the door");
  const kept = sessionStorage.getItem(SESSION_KEY);
  if (kept) {
    const still = await getJson<{ status: string }>(`/api/session/${encodeURIComponent(kept)}`);
    if (still.ok && still.data.status === "open") return { standKey, zones, sessionId: kept, reused };
  }
  const { doorLink } = must(await getJson<{ doorLink: string }>("/api/owner/door-link"));
  const token = new URLSearchParams(doorLink.split("#")[1] ?? "").get("store") ?? "";
  const checkIn = must(await getJson<{ sessionId: string }>("/api/session", jsonInit("POST", { store: token })));
  sessionStorage.setItem(SESSION_KEY, checkIn.sessionId);
  sessionStorage.setItem(STEPS_KEY, "0");
  return { standKey, zones, sessionId: checkIn.sessionId, reused };
}

/** Polls `fn` every `ms` while the tab is visible. */
function usePoll(fn: () => void, ms: number, on: boolean) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!on) return;
    const tick = () => document.visibilityState === "visible" && ref.current();
    tick();
    const t = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, on]);
}

export function StoreSimulator() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"idle" | "setting" | "ready" | "closed">("idle");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<{ text: string; limit?: boolean } | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [done, setDone] = useState(0);
  const [reads, setReads] = useState(0);
  const [reading, setReading] = useState<ShelfKey | null>(null);
  const [incoming, setIncoming] = useState<{ shelf: ShelfKey; before: string; after: string } | null>(null);
  const [basket, setBasket] = useState<SessionView | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [ownerSeen, setOwnerSeen] = useState(false);
  const [explain, setExplain] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<{ payLink?: string; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("shelves");
  const [closing, setClosing] = useState<"ask" | "busy" | null>(null);
  const [pulse, setPulse] = useState(0);
  const [pulseFrom, setPulseFrom] = useState<ShelfKey>("top");

  const stageRef = useRef<HTMLDivElement>(null);
  const shelfRefs = useRef<Record<ShelfKey, HTMLDivElement | null>>({ top: null, lower: null });
  const phoneRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setReads(Number(sessionStorage.getItem(READS_KEY) ?? 0) || 0);
    });
  }, []);

  const loadBasket = useCallback(async (id: string) => {
    const a = await getJson<SessionView>(`/api/session/${encodeURIComponent(id)}`);
    if (a.ok) setBasket(a.data);
    return a.ok ? a.data : null;
  }, []);
  const loadOwner = useCallback(async () => {
    const a = await getJson<Owner>("/api/owner/visits?days=1");
    if (a.ok) setOwner(a.data);
    return a.ok ? a.data : null;
  }, []);

  usePoll(() => store && void loadBasket(store.sessionId), 1500, phase === "ready" && store !== null);
  usePoll(() => void loadOwner(), 3000, phase === "ready");

  async function start() {
    if (phase === "setting") return;
    setPhase("setting");
    setProblem(null);
    try {
      const s = await openStore(setNote);
      setStore(s);
      const kept = Number(sessionStorage.getItem(STEPS_KEY) ?? 0) || 0;
      setDone(Math.min(kept, SCRIPT.length));
      setPhase("ready");
      setNote(s.reused ? "Using your trial store" : "Sample store open");
      await Promise.all([loadBasket(s.sessionId), loadOwner()]);
    } catch (e) {
      const err = e instanceof SetupError ? e : new SetupError(500);
      setProblem({ text: setupProblem(err.status, err.code), limit: err.code === "slow_down" || err.code === "trial_busy" });
      setPhase("idle");
    }
  }

  async function runStep() {
    const step = nextStep(done);
    if (!store || !step || reading || reads >= MAX_READS || result) return;
    setProblem(null);
    setReading(step.shelf);
    setIncoming({ shelf: step.shelf, before: step.before, after: step.after });
    const beforeLines: BillLine[] = basket?.bill.lines ?? [];
    try {
      const [b, a] = await Promise.all(
        [step.before, step.after].map((f) => fetch(`/samples/${f}`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("photo"))))),
      );
      const form = new FormData();
      form.append("before", new File([b], "before.jpg", { type: "image/jpeg" }));
      form.append("after", new File([a], "after.jpg", { type: "image/jpeg" }));
      const now = Date.now();
      form.append("changeStartedAt", String(now - 3000));
      form.append("settledAt", String(now));
      const used = reads + 1;
      setReads(used);
      sessionStorage.setItem(READS_KEY, String(used));
      const res = await fetch("/api/stand/change", {
        method: "POST",
        headers: { "x-stand-token": store.standKey, "x-stand-zone": store.zones[step.shelf] },
        body: form,
      }).catch(() => null);
      if (!res || !res.ok) {
        const body = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
        setProblem({ text: readProblem(res?.status ?? null, body.error) });
        setIncoming(null);
        return;
      }
      const [view, own] = await Promise.all([loadBasket(store.sessionId), loadOwner()]);
      const changes = basketChanges(beforeLines, view?.bill.lines ?? beforeLines);
      const latest = own?.visits
        .filter((v) => v.confidence !== null && v.confidence !== undefined)
        .sort((x, y) => (y.lastSettledAt ?? 0) - (x.lastSettledAt ?? 0))[0];
      const shelfName = SHELVES.find((s) => s.key === step.shelf)!.name;
      setExplain(
        explainRead({ shelfName, changes, confidence: changes.length ? (latest?.confidence ?? null) : null, totalCents: view?.bill.totalCents ?? 0 }),
      );
      setLive(announce(changes));
      const next = done + 1;
      setDone(next);
      sessionStorage.setItem(STEPS_KEY, String(next));
      setPulseFrom(step.shelf);
      setPulse((p) => p + 1);
    } catch {
      setProblem({ text: readProblem(null, undefined) });
    } finally {
      setReading(null);
      setTimeout(() => setIncoming((now) => (now?.after === step.after ? null : now)), 50);
    }
  }

  async function finish() {
    if (!store || finishing) return;
    setFinishing(true);
    const a = await getJson<{ status: string; payLink?: string }>(`/api/session/${encodeURIComponent(store.sessionId)}/done`, { method: "POST" });
    setFinishing(false);
    if (!a.ok) {
      setProblem({ text: "The basket couldn't be finished just now. Try again in a moment." });
      return;
    }
    if (a.data.status === "pay" && a.data.payLink) {
      setResult({ payLink: a.data.payLink, text: "The bill is ready to pay." });
    } else if (a.data.status === "closed") {
      setResult({ text: "Nothing was in the basket, so the visit closed with nothing to pay." });
    } else {
      setResult({ text: "The basket was paid from the hold." });
    }
    setLive("Basket finished.");
    void loadOwner();
  }

  async function close() {
    setClosing("busy");
    await fetch("/api/trial", { method: "DELETE" }).catch(() => null);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(STEPS_KEY);
    setStore(null);
    setBasket(null);
    setOwner(null);
    setResult(null);
    setExplain(null);
    setDone(0);
    setClosing(null);
    setPhase("closed");
  }

  const step = nextStep(done);
  const lines = basket?.bill.lines ?? [];
  const rail = stepRail({ store: phase === "ready", reads: done, lines: lines.length, done: result !== null, ownerSeen });
  const outOfReads = reads >= MAX_READS;

  // The one set piece: a dot travels shelf -> phone -> ledger when a read lands.
  const [path, setPath] = useState<{ x: number[]; y: number[] } | null>(null);
  useEffect(() => {
    if (pulse === 0 || reduce) return;
    const stage = stageRef.current;
    const from = shelfRefs.current[pulseFrom];
    const phone = phoneRef.current;
    const ledger = ledgerRef.current;
    if (!stage || !from || !phone || !ledger || !window.matchMedia("(min-width: 1100px)").matches) return;
    const base = stage.getBoundingClientRect();
    const mid = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
    };
    const a = { x: from.getBoundingClientRect().right - base.left, y: mid(from).y };
    const b = mid(phone);
    const c = { x: ledger.getBoundingClientRect().left - base.left, y: mid(ledger).y };
    queueMicrotask(() => setPath({ x: [a.x, b.x, c.x], y: [a.y, b.y, c.y] }));
  }, [pulse, pulseFrom, reduce]);

  const showPanel = (t: Tab) => ({ "data-tab-on": tab === t || undefined });

  return (
    <div className="sim">
      <p className="sr-only" aria-live="polite">
        {live}
      </p>

      <ol className="sim-rail" aria-label="The story so far">
        {STEP_NAMES.map((name, i) => (
          <li key={name} data-state={rail[i]} aria-current={rail[i] === "now" ? "step" : undefined}>
            <span className="sim-rail-mark num" aria-hidden="true">
              {rail[i] === "done" ? <IconCheck size={14} stroke={2.5} /> : i + 1}
            </span>
            <span>{name}</span>
          </li>
        ))}
      </ol>

      <div className="sim-bar ds-material-blue">
        {phase !== "ready" ? (
          <>
            <div className="sim-bar-text">
              <b>{phase === "closed" ? "The sample store is closed" : "One click sets up a real store"}</b>
              <span>
                {phase === "setting"
                  ? note
                  : "Two shelves, six products and a shopper checked in at the door, in a private trial store that is deleted after 24 hours."}
              </span>
            </div>
            <button type="button" className="sim-go ds-press ds-focus" onClick={start} aria-busy={phase === "setting"} disabled={phase === "setting"}>
              {phase === "setting" ? <IconLoader2 className="sim-spin" size={18} aria-hidden="true" /> : null}
              {phase === "setting" ? "Opening" : phase === "closed" ? "Open it again" : "Open the sample store"}
              {phase !== "setting" && <IconArrowRight size={18} stroke={2} aria-hidden="true" />}
            </button>
          </>
        ) : (
          <>
            <div className="sim-bar-text">
              <b>{step && !result ? `Next: ${step.label.toLowerCase()}` : result ? "The shopper has left" : "That's the whole story"}</b>
              <span>
                {note} · <span className="num">{reads}</span> of {MAX_READS} shelf reads used
              </span>
            </div>
            {step && !result ? (
              <button type="button" className="sim-go ds-press ds-focus" onClick={runStep} disabled={reading !== null || outOfReads} aria-busy={reading !== null}>
                {reading ? <IconLoader2 className="sim-spin" size={18} aria-hidden="true" /> : <IconCamera size={18} stroke={2} aria-hidden="true" />}
                {reading ? "Reading the shelf…" : step.label}
              </button>
            ) : null}
          </>
        )}
      </div>

      <AnimatePresence initial={false}>
        {problem && (
          <motion.p
            className="sim-problem"
            role="alert"
            initial={{ opacity: 0, y: reduce ? 0 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
          >
            {problem.text}
            {problem.limit && (
              <>
                {" "}
                <NextLink href="/demo" className="ds-focus">
                  Back to the demo
                </NextLink>
              </>
            )}
          </motion.p>
        )}
        {outOfReads && phase === "ready" && step && !result && (
          <p className="sim-note">This page has made its {MAX_READS} shelf reads for this visit. Each read is a paid vision model call, so it stops here.</p>
        )}
      </AnimatePresence>

      <div className="sim-tabs" role="tablist" aria-label="Panels">
        {(["shelves", "basket", "owner"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="ds-press ds-focus" onClick={() => {
            setTab(t);
            if (t === "owner" && result) setOwnerSeen(true);
          }}>
            {t === "shelves" ? "Shelves" : t === "basket" ? "Basket" : "Owner"}
          </button>
        ))}
      </div>

      <div className="sim-stage" ref={stageRef}>
        {/* Shelf cameras */}
        <section className="sim-panel sim-shelves" aria-labelledby="sim-shelves-h" {...showPanel("shelves")}>
          <header className="sim-panel-head">
            <h2 id="sim-shelves-h">Shelf cameras</h2>
            <span>Aisle 1</span>
          </header>
          {SHELVES.map((s) => {
            const showing = pictureAfter(s.key, done);
            const busy = reading === s.key;
            const swap = incoming?.shelf === s.key ? incoming : null;
            return (
              <div key={s.key} className="sim-cam" ref={(el) => { shelfRefs.current[s.key] = el; }} data-busy={busy || undefined}>
                <div className="sim-cam-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/samples/${swap ? swap.before : showing}`} alt="" />
                  <AnimatePresence>
                    {swap && (
                      <motion.img
                        key={swap.after}
                        src={`/samples/${swap.after}`}
                        alt=""
                        className="sim-cam-after"
                        initial={{ opacity: 0, filter: reduce ? "none" : "blur(3px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={{ duration: 0.6, ease: easeOut }}
                      />
                    )}
                  </AnimatePresence>
                  {busy && !reduce && <span className="sim-scan" aria-hidden="true" />}
                  <span className="sim-cam-tag">
                    <i data-live={phase === "ready" || undefined} />
                    {s.name}
                  </span>
                  {busy && <span className="sim-cam-reading">Reading the shelf…</span>}
                </div>
                <p className="sim-cam-alt">
                  {busy && incoming ? SCRIPT.find((x) => x.after === incoming.after)?.label : `${s.name} camera`}
                </p>
              </div>
            );
          })}
          <p className="sim-honest">
            Sample shelf pictures, composed from product photos, stand in for live video. The reads, bills and pay link
            are real.
          </p>
        </section>

        {/* Shopper's phone */}
        <section className="sim-panel sim-phone-col" aria-labelledby="sim-phone-h" {...showPanel("basket")}>
          <h2 id="sim-phone-h" className="sr-only">
            The shopper&apos;s basket
          </h2>
          <div className="sim-phone" ref={phoneRef}>
            <div className="sim-phone-notch" aria-hidden="true" />
            <div className="sim-phone-screen">
              <header className="sim-basket-head">
                <span>Your basket</span>
                <RollingNumber
                  className="num sim-basket-total"
                  value={basket?.bill.totalCents ?? 0}
                  text={money(basket?.bill.totalCents ?? 0)}
                  label={`Basket total ${money(basket?.bill.totalCents ?? 0)}`}
                />
              </header>
              <ul className="sim-lines">
                <AnimatePresence initial={false} mode="popLayout">
                  {lines.map((l) => (
                    <motion.li
                      key={l.sku}
                      layout={!reduce}
                      initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: reduce ? 0 : -16 }}
                      transition={spring}
                    >
                      <span className="sim-qty num">{l.qty}×</span>
                      <span className="sim-line-name">{l.name}</span>
                      <RollingNumber className="num" value={l.lineCents} text={money(l.lineCents)} />
                    </motion.li>
                  ))}
                </AnimatePresence>
                {lines.length === 0 && (
                  <li className="sim-empty">{phase === "ready" ? "Take something from a shelf and it lands here." : "Checked in at the door, nothing taken yet."}</li>
                )}
              </ul>
              <div className="sim-phone-foot">
                <AnimatePresence mode="wait" initial={false}>
                  {result ? (
                    <motion.div key="result" className="sim-result" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                      <p>{result.text}</p>
                      {result.payLink && (
                        <>
                          <a className="sim-paypal ds-press ds-focus" href={result.payLink} target="_blank" rel="noopener">
                            Pay with PayPal (sandbox)
                            <IconExternalLink size={16} stroke={2} aria-hidden="true" />
                          </a>
                          <small>Paying needs a PayPal sandbox buyer account. It is test money: nothing real moves.</small>
                        </>
                      )}
                    </motion.div>
                  ) : (
                    <motion.button
                      key="done"
                      type="button"
                      className="sim-done ds-press ds-focus"
                      onClick={finish}
                      disabled={phase !== "ready" || finishing || reading !== null}
                      aria-busy={finishing}
                      whileTap={reduce ? undefined : { scale: 0.97 }}
                      transition={springSnappy}
                    >
                      {finishing ? "Finishing…" : "Done"}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {explain && (
              <motion.div key={explain} className="sim-explain" initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <h3>What just happened</h3>
                <p>{explain}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Owner */}
        <section className="sim-panel sim-owner" aria-labelledby="sim-owner-h" {...showPanel("owner")}
          onPointerEnter={() => result && setOwnerSeen(true)} onFocus={() => result && setOwnerSeen(true)}>
          <header className="sim-panel-head">
            <h2 id="sim-owner-h">The owner&apos;s ledger</h2>
            <span>Today</span>
          </header>
          <OwnerPanel owner={owner} ledgerRef={ledgerRef} zones={store?.zones ?? null} reduce={!!reduce} />
          {phase === "ready" && (
            <NextLink href="/owner" className="sim-owner-link ds-focus" target="_blank" onClick={() => setOwnerSeen(true)}>
              Open the full dashboard
              <IconArrowUpRight size={16} stroke={2} aria-hidden="true" />
            </NextLink>
          )}
        </section>

        <AnimatePresence>
          {path && (
            <motion.span
              key={pulse}
              className="sim-dot"
              aria-hidden="true"
              initial={{ x: path.x[0], y: path.y[0], opacity: 0, scale: 0.6 }}
              animate={{ x: path.x, y: path.y, opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.8] }}
              transition={{ duration: 1.1, ease: [0.77, 0, 0.175, 1], times: [0, 0.5, 1], opacity: { times: [0, 0.1, 0.85, 1], duration: 1.1 } }}
              onAnimationComplete={() => setPath(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {phase === "ready" && (
        <div className="sim-close">
          {closing === null && (
            <button type="button" className="sim-quiet ds-press ds-focus" onClick={() => setClosing("ask")}>
              Close the sample store
            </button>
          )}
          {closing !== null && (
            <p role="group" aria-label="Close the sample store">
              <span>Delete the store, its visits and its shelves now? It closes itself after 24 hours anyway.</span>
              <button type="button" className="sim-quiet ds-press ds-focus" data-tone="coral" onClick={close} disabled={closing === "busy"}>
                {closing === "busy" ? "Closing…" : "Yes, close it"}
              </button>
              <button type="button" className="sim-quiet ds-press ds-focus" onClick={() => setClosing(null)} disabled={closing === "busy"}>
                Keep it
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OwnerPanel({ owner, ledgerRef, zones, reduce }: { owner: Owner | null; ledgerRef: React.RefObject<HTMLDivElement | null>; zones: Record<ShelfKey, string> | null; reduce: boolean }) {
  const open = (owner?.visits ?? []).filter((v) => v.status === "open").reduce((s, v) => s + v.detectedCents, 0);
  const figs = [
    { key: "paid", label: "Paid", cents: owner?.totals.paidCents ?? 0 },
    { key: "open", label: "Open baskets", cents: open },
    { key: "unmatched", label: "Unmatched", cents: owner?.totals.unmatchedCents ?? 0 },
  ];
  const whole = figs.reduce((s, f) => s + f.cents, 0);
  const visits = [...(owner?.visits ?? [])].filter((v) => v.status !== "empty").sort((a, b) => b.openedAt - a.openedAt).slice(0, 4);
  return (
    <>
      <div className="sim-ledger" ref={ledgerRef}>
        <div className="sim-ledger-bar" role="img" aria-label={figs.map((f) => `${f.label} ${money(f.cents)}`).join(", ")}>
          {figs.map((f) => (
            <motion.span key={f.key} data-part={f.key} animate={{ flexGrow: whole ? f.cents / whole : 0 }} transition={reduce ? { duration: 0 } : spring} />
          ))}
        </div>
        <dl className="sim-figs">
          {figs.map((f) => (
            <div key={f.key} data-part={f.key}>
              <dt>
                <i aria-hidden="true" />
                {f.label}
              </dt>
              <dd>
                <RollingNumber className="num" value={f.cents} text={money(f.cents)} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <h3 className="sim-sub">By shelf</h3>
      <div className="sim-zones">
        {SHELVES.map((s) => {
          const fig = owner?.byZone.find((z) => zones && z.zoneId === zones[s.key]);
          return (
            <div key={s.key} className="sim-zone">
              <span>{s.name}</span>
              <RollingNumber className="num" value={fig?.takenCents ?? 0} text={money(fig?.takenCents ?? 0)} />
              <small>
                {fig?.visits ?? 0} {fig?.visits === 1 ? "visit" : "visits"}
              </small>
            </div>
          );
        })}
      </div>
      <h3 className="sim-sub">Latest visits</h3>
      <ul className="sim-visits">
        <AnimatePresence initial={false}>
          {visits.map((v) => (
            <motion.li key={v.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: easeOut }}>
              <span className="sim-visit-items">
                {v.detectedBill.lines.length ? v.detectedBill.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") : "Nothing yet"}
              </span>
              <span className="num">{money(v.detectedCents)}</span>
              <span className="sim-chip" data-status={v.status}>
                {v.status === "open" ? "Open" : v.status === "paid" ? "Paid" : v.status === "unmatched" ? "Unmatched" : v.status}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {visits.length === 0 && <li className="sim-empty">No visits today yet.</li>}
      </ul>
    </>
  );
}
