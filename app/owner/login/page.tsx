"use client";

import { Button } from "@astryxdesign/core/Button";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useAnimate, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { easeOut } from "@/lib/motion";
import "../owner.css";

type Problem = { kind: "passcode" | "locked"; text: string };

export default function OwnerLogin() {
  const router = useRouter();
  const announce = useAnnounce();
  const reduce = useReducedMotion();
  const [sheet, animate] = useAnimate<HTMLDivElement>();
  const [passcode, setPasscode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  function show(next: Problem) {
    setProblem(next);
    announce(next.text, "assertive");
    // A wrong passcode gets a short sideways shake, the way a locked door answers a push.
    if (next.kind === "passcode" && !reduce && sheet.current) {
      void animate(sheet.current, { x: [0, -9, 8, -6, 4, 0] }, { duration: 0.36, ease: "easeInOut" });
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!passcode) return show({ kind: "passcode", text: "Enter the passcode." });
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/owner/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    }).catch(() => null);
    if (res?.ok) {
      // The sheet lifts away while the dashboard loads behind it.
      if (sheet.current) {
        void animate(
          sheet.current,
          reduce ? { opacity: 0 } : { opacity: 0, scale: 1.03, filter: "blur(10px)" },
          { duration: 0.32, ease: easeOut },
        );
      }
      return router.replace("/owner");
    }
    setBusy(false);
    if (res?.status === 429) show({ kind: "locked", text: "Too many tries. Wait a minute, then try again." });
    else show({ kind: "passcode", text: "That passcode isn't right." });
  }

  return (
    <div className="ow-login void">
      <div className="ow-login-light" aria-hidden="true" />
      <main className="ow-login-main">
        <Wordmark />
        <div className="ow-sheet-in">
          <div className="ow-sheet" ref={sheet}>
            <h1>Owner sign-in</h1>
            <p className="ow-sheet-lead">Enter your stand&apos;s passcode.</p>
            <form onSubmit={signIn} noValidate>
              <TextInput
                type="password"
                label="Passcode"
                size="lg"
                width="100%"
                value={passcode}
                onChange={(value) => {
                  setPasscode(value);
                  if (problem?.kind === "passcode") setProblem(null);
                }}
                autoComplete="current-password"
                enterKeyHint="go"
                hasAutoFocus
                statusVariant="detached"
                status={problem?.kind === "passcode" ? { type: "error", message: problem.text } : undefined}
              />
              {problem?.kind === "locked" && (
                <p className="ow-sheet-wait" role="status">
                  {problem.text}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" width="100%" label="Sign in" isLoading={busy} />
            </form>
            <p className="ow-sheet-demo">
              The demo stand&apos;s passcode is <code>demo</code>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
