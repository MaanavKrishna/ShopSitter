"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import "../owner.css";

type Problem = { kind: "passcode" | "locked"; text: string };

export default function OwnerLogin() {
  const router = useRouter();
  const announce = useAnnounce();
  const [passcode, setPasscode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  function show(next: Problem) {
    setProblem(next);
    announce(next.text, "assertive");
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
    if (res?.ok) return router.replace("/owner");
    setBusy(false);
    if (res?.status === 429) show({ kind: "locked", text: "Too many tries. Wait a minute, then try again." });
    else show({ kind: "passcode", text: "That passcode isn't right." });
  }

  return (
    <div className="ow-login void">
      <header className="topbar">
        <Wordmark />
      </header>
      <main className="ow-login-main">
        <Card padding={6} elevation="high" width="100%" maxWidth={416}>
          <VStack gap={5}>
            <VStack gap={2}>
              <Heading level={1}>Owner sign-in</Heading>
              <Text as="p" color="secondary">
                Enter the stand&apos;s passcode to see what sold. The demo stand&apos;s passcode is{" "}
                <Text weight="semibold" color="primary">
                  demo
                </Text>
                .
              </Text>
            </VStack>
            {problem?.kind === "locked" && <Banner status="warning" title={problem.text} />}
            <form onSubmit={signIn} noValidate>
              <VStack gap={5}>
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
                  statusVariant="detached"
                  status={problem?.kind === "passcode" ? { type: "error", message: problem.text } : undefined}
                />
                <Button type="submit" variant="primary" size="lg" width="100%" label="Sign in" isLoading={busy} />
              </VStack>
            </form>
          </VStack>
        </Card>
      </main>
    </div>
  );
}
