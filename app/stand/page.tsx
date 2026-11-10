"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { StandCamera, type CameraPhase, type ShelfChange } from "@/components/StandCamera";
import { Wordmark } from "@/components/Wordmark";
import { formatCents } from "@/lib/money";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";
import "./stand.css";

const TOKEN_KEY = "shopsitter-stand-token";
const PAID_MESSAGE_MS = 6000;
const CODE_LENGTH = 6;
const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

type Current = { visit: Visit; bill: PricedBill };

export default function StandPage() {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [justPaid, setJustPaid] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [phase, setPhase] = useState<CameraPhase>("starting");
  const [note, setNote] = useState<string | null>(null);
  const [stats, setStats] = useState<{ moving: number; differs: number } | null>(null);
  const [readNow, setReadNow] = useState(0);
  // 1 is the main camera, which shows the bill. 2 to 4 are extra cameras on other sides of the shelf.
  const [angle, setAngle] = useState(1);
  const [cameras, setCameras] = useState(1);
  const [sighting, setSighting] = useState<{ hand: boolean; person: boolean; present: boolean } | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Saved on this device after the first visit; read after mount so the server render matches.
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) queueMicrotask(() => setToken(saved));
    const asked = Number(new URLSearchParams(window.location.search).get("angle"));
    if ([2, 3, 4].includes(asked)) queueMicrotask(() => setAngle(asked));
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
          if (change.zoom) {
            form.set("beforeZoom", change.zoom.before, "before-zoom.jpg");
            form.set("afterZoom", change.zoom.after, "after-zoom.jpg");
          }
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
          const data = (await res.json()) as { visit: Visit | null; bill: PricedBill | null; cameras?: number };
          setCameras(data.cameras ?? 1);
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

  // Extra cameras: send each new still of the shelf. The main camera decides when to read.
  const onShot = useCallback(
    (photo: Blob, takenAt: number) => {
      const form = new FormData();
      form.set("photo", photo, "angle.jpg");
      form.set("angle", String(angle));
      form.set("takenAt", String(takenAt));
      fetch("/api/stand/angle", { method: "POST", headers: { "x-stand-token": token ?? "" }, body: form }).then(
        (res) => {
          if (res.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setProblem("That stand code isn't right. Enter it again.");
          } else if (res.ok) {
            setProblem(null);
            setSentAt(takenAt);
          } else setProblem("This camera couldn't reach the server. It will keep trying.");
        },
        () => setProblem("This camera couldn't reach the server. It will keep trying."),
      );
    },
    [angle, token],
  );

  // Someone stopped by and has gone: only the count is reported.
  const onVisitorLeft = useCallback(() => {
    void fetch("/api/stand/presence", { method: "POST", headers: { "x-stand-token": token ?? "" } }).catch(() => {});
  }, [token]);

  const privacyLine = (
    <p className="sd-privacy">
      {angle > 1
        ? "A camera counts items on this shelf. It does not record people."
        : "A camera counts items on this shelf. It notices when someone is here, on this device only, and does not record people."}
    </p>
  );
  const problemBanner = problem && (
    <div role="alert" className="sd-problem">
      <Banner status="warning" title={problem} />
    </div>
  );

  if (token && angle > 1) {
    const connecting = phase === "starting" || !sentAt;
    return (
      <main className="void sd sd-angle">
        <header className="sd-head">
          <Wordmark href="/stand" />
          <span className="sd-chip">Camera {angle}</span>
        </header>
        <div className="sd-body">
          <div className="sd-ready">
            <h1>Camera {angle}</h1>
            <p>Point this at the shelf from another side. The bill shows on the main stand screen.</p>
          </div>
        </div>
        <footer className="sd-foot">
          {problemBanner}
          <div className="sd-bar">
            <StandCamera onChange={() => {}} onPhase={setPhase} onShot={onShot} onSighting={setSighting} />
            <div className="sd-live">
              <div className="sd-status" data-tone={connecting ? "busy" : "calm"}>
                <span className="sd-indicator" aria-hidden="true">
                  {connecting ? <Spinner size="md" shade="onMedia" /> : <StatusDot variant="neutral" label="Connected" />}
                </span>
                <p role="status">
                  {phase === "starting"
                    ? "Starting the camera…"
                    : sentAt
                      ? `Sending this view to the stand. Last sent ${new Date(sentAt).toLocaleTimeString()}.`
                      : "Connecting to the stand…"}
                </p>
              </div>
              {privacyLine}
            </div>
          </div>
        </footer>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="void sd sd-setup">
        <header className="sd-head">
          <Wordmark />
        </header>
        <div className="sd-setup-wrap">
          <Card padding={6} elevation="high" width="100%">
            <form
              className="sd-setup-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const code = draft.trim();
                if (code.length !== CODE_LENGTH) {
                  setCodeError(
                    code ? `The stand code has ${CODE_LENGTH} digits.` : `Enter the ${CODE_LENGTH}-digit stand code.`,
                  );
                  return;
                }
                localStorage.setItem(TOKEN_KEY, code);
                setProblem(null);
                setCodeError(null);
                setToken(code);
              }}
            >
              <div className="sd-setup-copy">
                <Heading level={1}>Set up this stand</Heading>
                <Text as="p" type="body" color="secondary">
                  Prop this device so its camera sees the whole shelf, then enter the stand code.
                </Text>
              </div>
              {problem && (
                <div role="alert">
                  <Banner status="error" title={problem} />
                </div>
              )}
              <TextInput
                label="Stand code"
                description={`The ${CODE_LENGTH}-digit code for this stand.`}
                value={draft}
                onChange={(value) => {
                  setDraft(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
                  setCodeError(null);
                }}
                size="lg"
                width="100%"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="go"
                hasAutoCorrect={false}
                hasSpellCheck={false}
                placeholder="000000"
                status={codeError ? { type: "error", message: codeError } : undefined}
                statusVariant="detached"
                controlClassName="sd-code"
              />
              <Button type="submit" variant="primary" size="lg" width="100%" label="Start watching the shelf" />
              <Text as="p" type="supporting">
                A camera counts items on this shelf. It does not record people.
              </Text>
            </form>
          </Card>
        </div>
      </main>
    );
  }

  const lowConfidence = current?.visit.confidence !== null && (current?.visit.confidence ?? 1) < 0.6;
  const manualOnly = !!current?.visit.needsManual && current.bill.totalCents === 0;

  const handAtShelf = !reading && !!sighting?.hand;
  const tone = reading ? "busy" : handAtShelf || phase === "moving" ? "alert" : phase === "starting" ? "busy" : "calm";

  return (
    <main className="void sd" data-view={justPaid !== null ? "paid" : current ? "bill" : "ready"}>
      <header className="sd-head">
        <Wordmark href="/stand" />
      </header>

      <div className="sd-body" aria-live="polite">
        {justPaid !== null ? (
          <div className="sd-paid">
            <svg className="sd-paid-mark" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r="24" />
              <path d="M14 24.5l7 7 13-14" />
            </svg>
            <span className="num">${formatCents(justPaid)}</span>
            <h1>Paid, thank you</h1>
          </div>
        ) : current ? (
          <>
            <section className="sd-bill">
              <h1>{manualOnly ? "Couldn’t read the shelf" : "Your bill"}</h1>
              {manualOnly ? (
                <p className="sd-hint">Scan the code to enter what you took.</p>
              ) : (
                <ul className="glass">
                  {current.bill.lines.map((l) => (
                    <li key={l.sku}>
                      <span className="sd-qty">{l.qty}</span>
                      <span className="sd-name">{l.name}</span>
                      <span className="num">${formatCents(l.lineCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!manualOnly && (lowConfidence || current.visit.needsManual) && (
                <p className="sd-hint">Not sure we got that right. Please check it on your phone.</p>
              )}
            </section>

            <aside className="sd-pay">
              {!manualOnly && (
                <p className="sd-total">
                  <span>Total</span>
                  <span className="num">${formatCents(current.bill.totalCents)}</span>
                </p>
              )}
              <div className="sd-qr">
                <div className="sd-qr-code">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
                  {qr && <img src={qr} alt="QR code to pay this bill with PayPal" />}
                </div>
                <div className="sd-qr-copy">
                  <p className="sd-scan">Scan to pay with PayPal</p>
                  <p className="sd-fix">Wrong? Fix it on your phone.</p>
                </div>
              </div>
            </aside>
          </>
        ) : (
          <div className="sd-ready">
            <h1>Take what you like</h1>
            <p>Your bill appears here.</p>
          </div>
        )}
      </div>

      <footer className="sd-foot">
        {problemBanner}
        <div className="sd-bar">
          <StandCamera
            onChange={onChange}
            onPhase={setPhase}
            onStats={setStats}
            readNow={readNow}
            onSighting={setSighting}
            onVisitorLeft={onVisitorLeft}
          />
          <div className="sd-live">
            <div className="sd-status" data-tone={tone}>
              <span className="sd-indicator" aria-hidden="true">
                {tone === "busy" ? (
                  <Spinner size="md" shade="onMedia" />
                ) : (
                  <StatusDot
                    variant={tone === "alert" ? "warning" : "neutral"}
                    isPulsing={tone === "alert"}
                    label={tone === "alert" ? "Waiting" : "Watching"}
                  />
                )}
              </span>
              <p role="status">
                {reading
                  ? "Reading the shelf…"
                  : sighting?.hand
                    ? "A hand is at the shelf. Waiting until it is clear…"
                    : phase === "moving"
                      ? "Something moved. Waiting for the shelf to go still…"
                      : phase === "starting"
                        ? "Starting the camera…"
                        : (note ?? "Watching the shelf. Keep this device still.")}
              </p>
            </div>
            {privacyLine}
            {stats && (
              <p className="sd-stats">
                Moving areas {stats.moving}. Areas changed since last read {stats.differs}.
              </p>
            )}
          </div>
          <div className="sd-side">
            {stats && (
              <ul className="sd-chips">
                <li className="sd-chip">
                  {cameras} {cameras === 1 ? "camera" : "cameras"}
                </li>
                <li className="sd-chip" data-on={!!sighting?.present}>
                  {sighting === null ? "People check starting or unavailable" : sighting.present ? "Someone is here" : "Nobody here"}
                </li>
              </ul>
            )}
            <button type="button" className="btn btn-ghost sd-readnow" disabled={reading} onClick={() => setReadNow((n) => n + 1)}>
              Read the shelf now
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
