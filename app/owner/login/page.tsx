"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/Wordmark";

export default function OwnerLogin() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/owner/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.replace("/owner");
    else if (res?.status === 429) setProblem("Too many tries. Wait a minute, then try again.");
    else setProblem("That passcode isn't right.");
  }

  return (
    <div className="owner-login-wrap void">
      <header className="topbar">
        <Wordmark />
      </header>
      <main className="owner-login panel">
        <h1>Owner sign-in</h1>
      <p>Enter the stand&apos;s passcode to see what sold. The demo stand&apos;s passcode is <strong>demo</strong>.</p>
      <form onSubmit={signIn}>
        <label htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoComplete="current-password"
          required
        />
        {problem && (
          <p role="alert" className="pay-notice">
            {problem}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      </main>
    </div>
  );
}
