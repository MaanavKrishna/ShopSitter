"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { StandCamera, type CameraPhase, type ShelfChange } from "@/components/StandCamera";
import { Wordmark } from "@/components/Wordmark";
import { formatCents } from "@/lib/money";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";

const TOKEN_KEY = "shopsitter-stand-token";
const PAID_MESSAGE_MS = 6000;
const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

type Current = { visit: Visit; bill: PricedBill };

export default function StandPage() {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useState<Current | null>(null);
  const [justPaid, setJustPaid] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [phase, setPhase] = useState<CameraPhase>("starting");
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Saved on this device after the first visit; read after mount so the server render matches.
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) queueMicrotask(() => setToken(saved));
  }, []);

  // Keep the screen awake while the stand is running.
  useEffect(() => {
    if (!token || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [token]);

  const visitId = current?.visit.id ?? null;

  useEffect(() => {
    if (!visitId) return;
    let live = true;
    QRCode.toDataURL(`${window.location.origin}/pay/${visitId}`, { margin: 1, width: 520 }).then((url) => {
      if (live) setQr(url);
    });
    return () => {
      live = false;
    };
  }, [visitId]);

  // Follow the open bill: the customer may correct it or pay it from their phone.
  useEffect(() => {
    if (!visitId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/visits/${visitId}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as Current;
      if (isPaid(data.visit)) {
        setJustPaid(data.visit.paidCents ?? 0);
        setCurrent(null);
        setTimeout(() => setJustPaid(null), PAID_MESSAGE_MS);
      } else if (data.visit.status === "open") {
        setCurrent(data);
      } else {
        setCurrent(null);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [visitId]);

  const onChange = useCallback(
    (change: ShelfChange) => {
      // One read at a time, in order, so bills never arrive out of sequence.
      queue.current = queue.current.then(async () => {
        setReading(true);
        try {
          const form = new FormData();
          form.set("before", change.before, "before.jpg");
          form.set("after", change.after, "after.jpg");
          form.set("changeStartedAt", String(change.changeStartedAt));
          form.set("settledAt", String(change.settledAt));
          const res = await fetch("/api/stand/change", {
            method: "POST",
            headers: { "x-stand-token": token ?? "" },
            body: form,
          });
          if (res.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setProblem("That stand code isn't right. Enter it again.");
            return;
          }
          if (!res.ok) {
            setProblem("The stand couldn't reach the server. It will keep trying.");
            return;
          }
          setProblem(null);
          const data = (await res.json()) as { visit: Visit | null; bill: PricedBill | null };
          const open = data.visit && data.bill && data.visit.status === "open";
          setCurrent(open ? { visit: data.visit!, bill: data.bill! } : null);
          // Say so when a change was seen but nothing is owed, so the stand never looks stuck.
          setNote(open ? null : "Nothing was taken.");
          if (!open) setTimeout(() => setNote(null), 6000);
        } catch {
          setProblem("The stand couldn't reach the server. It will keep trying.");
        } finally {
          setReading(false);
        }
      });
    },
    [token],
  );

  if (!token) {
    return (
      <main className="void stand stand-setup">
        <header className="stand-head">
          <Wordmark />
        </header>
        <div className="stand-setup-card panel">
          <h1>Set up this stand</h1>
          <p>Prop this device so its camera sees the whole shelf, then enter the stand code.</p>
          {problem && (
            <p role="alert" className="notice">
              {problem}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              localStorage.setItem(TOKEN_KEY, draft.trim());
              setProblem(null);
              setToken(draft.trim());
            }}
          >
            <label htmlFor="stand-code">Stand code</label>
            <input id="stand-code" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
            <button className="btn btn-coral btn-pay" type="submit">
              Start watching the shelf
            </button>
          </form>
        </div>
      </main>
    );
  }

  const lowConfidence = current?.visit.confidence !== null && (current?.visit.confidence ?? 1) < 0.6;
  const manualOnly = !!current?.visit.needsManual && current.bill.totalCents === 0;

  return (
    <main className="void stand">
      <header className="stand-head">
        <Wordmark href="/stand" />
      </header>

      <div className="stand-body" aria-live="polite">
        {justPaid !== null ? (
          <div className="stand-paid">
            <span className="num">${formatCents(justPaid)}</span>
            <h1>Paid, thank you</h1>
          </div>
        ) : current ? (
          <>
            <section className="stand-bill">
              <h1>{manualOnly ? "Couldn\u2019t read the shelf" : "Your bill"}</h1>
              {manualOnly ? (
                <p className="stand-hint">Scan the code to enter what you took.</p>
              ) : (
                <ul className="glass">
                  {current.bill.lines.map((l) => (
                    <li key={l.sku}>
                      <span className="stand-qty">{l.qty}</span>
                      <span className="stand-name">{l.name}</span>
                      <span className="num">${formatCents(l.lineCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!manualOnly && (lowConfidence || current.visit.needsManual) && (
                <p className="stand-hint">Not sure we got that right. Please check it on your phone.</p>
              )}
            </section>

            <aside className="stand-tag">
              {!manualOnly && (
                <p className="stand-total">
                  <span>Total</span>
                  <span className="num">${formatCents(current.bill.totalCents)}</span>
                </p>
              )}
              <div className="stand-qr">
                {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
                {qr && <img src={qr} alt="QR code to pay this bill with PayPal" />}
                <div>
                  <p className="stand-scan">Scan to pay with PayPal</p>
                  <p className="stand-fix">Wrong? Fix it on your phone.</p>
                </div>
              </div>
            </aside>
          </>
        ) : (
          <div className="stand-ready">
            <h1>Take what you like</h1>
            <p>Your bill appears here.</p>
          </div>
        )}
      </div>

      <footer className="stand-foot">
        <StandCamera onChange={onChange} onPhase={setPhase} />
        <p>
          A camera counts items on this shelf. It does not record people.
        </p>
        <p className="stand-status" role="status">
          {reading
            ? "Reading the shelf…"
            : phase === "moving"
              ? "Something moved. Waiting for the shelf to go still…"
              : phase === "starting"
                ? "Starting the camera…"
                : (note ?? "Watching the shelf. Keep this device still.")}
        </p>
        {problem && (
          <p role="alert" className="stand-problem">
            {problem}
          </p>
        )}
      </footer>
    </main>
  );
}
