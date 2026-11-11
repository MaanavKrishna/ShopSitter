"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "shopsitter-stand-token";
/** A set-up stand waits at most this long for the check of its saved code before it starts. */
const BOOT_CHECK_MS = 3000;

export type CodeCheck = "ok" | "wrong" | "ended" | "limited" | "unreachable";
export type StandKind = "live" | "trial";
export type StandCheck = { result: CodeCheck; kind: StandKind | null };

/**
 * Asks the server whether a stand code or a trial's stand key is good, and which kind of stand it
 * belongs to. Nothing is uploaded. "ended" is a genuine trial key whose trial is over.
 */
export async function checkStand(code: string): Promise<StandCheck> {
  const res = await fetch("/api/stand/check", { headers: { "x-stand-token": code }, cache: "no-store" }).catch(() => null);
  if (!res) return { result: "unreachable", kind: null };
  if (res.ok) return { result: "ok", kind: res.headers.get("x-stand-kind") === "trial" ? "trial" : "live" };
  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { result: body?.error === "trial_ended" ? "ended" : "wrong", kind: null };
  }
  if (res.status === 429) return { result: "limited", kind: null };
  return { result: "unreachable", kind: null };
}

/** Asks the server whether a stand code is the right one. Nothing is uploaded. */
export const checkStandCode = async (code: string): Promise<CodeCheck> => (await checkStand(code)).result;

/**
 * A trial's stand key carried by the page's address as "#key=…", or null. The key is taken off
 * the address bar straight away, so it is not left in the history or shared by accident.
 */
function takeKeyFromAddress(): string | null {
  const key = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key")?.trim();
  if (!key) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return key;
}

/** True when a failed request's answer says the trial behind this device's key is over. */
export async function saysTrialEnded(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const body = (await res.clone().json().catch(() => null)) as { error?: string } | null;
  return body?.error === "trial_ended";
}

/**
 * The stand code or trial key this device was set up with. The main stand screen and every extra
 * camera on the same device share it. A key that arrives in the address ("#key=…") is saved the
 * way a typed code is and then checked like one. `booted` turns true once the saved value has
 * been looked up and checked, so a set-up device never flashes the set-up sheet. A saved value
 * the server no longer accepts is dropped: `refused` says a code went wrong, `ended` that a
 * trial is over.
 */
export function useStandToken() {
  const [token, setToken] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [refused, setRefused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [kind, setKind] = useState<StandKind | null>(null);

  useEffect(() => {
    // Read after mount so the server render matches.
    const fromLink = takeKeyFromAddress();
    if (fromLink) localStorage.setItem(TOKEN_KEY, fromLink);
    const saved = localStorage.getItem(TOKEN_KEY);
    let live = true;
    let mounted = true;
    const start = (code: string | null) => {
      if (!live) return;
      live = false;
      if (code) setToken(code);
      setBooted(true);
    };
    if (!saved) {
      queueMicrotask(() => start(null));
      return;
    }
    // A code that worked before still runs the stand when the check cannot be made (no connection,
    // too many tries): only a clear "wrong" or "ended" sends the device back to set-up.
    const timer = setTimeout(() => start(saved), BOOT_CHECK_MS);
    void checkStand(saved).then(({ result, kind: found }) => {
      clearTimeout(timer);
      if (!mounted) return;
      if (found) setKind(found);
      if (result !== "wrong" && result !== "ended") return start(saved);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      if (result === "ended") setEnded(true);
      else setRefused(true);
      start(null);
    });
    return () => {
      live = false;
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // A stand link opened in a tab that already shows this page only changes the part after "#":
  // the key is saved and the page starts again with it.
  useEffect(() => {
    const onHash = () => {
      const key = takeKeyFromAddress();
      if (!key) return;
      localStorage.setItem(TOKEN_KEY, key);
      window.location.reload();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const save = useCallback((code: string, standKind: StandKind | null = null) => {
    localStorage.setItem(TOKEN_KEY, code);
    setRefused(false);
    setEnded(false);
    setKind(standKind);
    setToken(code);
  }, []);

  /** The server refused the code: drop it so the set-up sheet comes back. */
  const forget = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setKind(null);
  }, []);

  /** The server says this device's trial is over: drop the key and say so. */
  const end = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setKind(null);
    setEnded(true);
  }, []);

  return { token, booted, refused, ended, kind, save, forget, end };
}

/** Shown on the set-up sheet when the code saved on this device stopped working. */
export const SAVED_CODE_REFUSED = "The stand code saved on this device is no longer right. Enter the new one.";
