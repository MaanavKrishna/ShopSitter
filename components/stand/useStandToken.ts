"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "shopsitter-stand-token";
/** A set-up stand waits at most this long for the check of its saved code before it starts. */
const BOOT_CHECK_MS = 3000;

export type CodeCheck = "ok" | "wrong" | "limited" | "unreachable";

/** Asks the server whether a stand code is the right one. Nothing is uploaded. */
export async function checkStandCode(code: string): Promise<CodeCheck> {
  const res = await fetch("/api/stand/check", { headers: { "x-stand-token": code }, cache: "no-store" }).catch(() => null);
  if (!res) return "unreachable";
  if (res.ok) return "ok";
  if (res.status === 401) return "wrong";
  if (res.status === 429) return "limited";
  return "unreachable";
}

/**
 * The stand code this device was set up with. The main stand screen and every extra camera
 * on the same device share it. `booted` turns true once the saved code has been looked up
 * and checked, so a set-up device never flashes the set-up sheet. A saved code the server
 * no longer accepts is dropped and `refused` says so.
 */
export function useStandToken() {
  const [token, setToken] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    // Read after mount so the server render matches.
    const saved = localStorage.getItem(TOKEN_KEY);
    let live = true;
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
    // too many tries): only a clear "wrong" sends the device back to set-up.
    const timer = setTimeout(() => start(saved), BOOT_CHECK_MS);
    void checkStandCode(saved).then((result) => {
      clearTimeout(timer);
      if (result !== "wrong") return start(saved);
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setRefused(true);
      start(null);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  const save = useCallback((code: string) => {
    localStorage.setItem(TOKEN_KEY, code);
    setRefused(false);
    setToken(code);
  }, []);

  /** The server refused the code: drop it so the set-up sheet comes back. */
  const forget = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return { token, booted, refused, save, forget };
}

/** Shown on the set-up sheet when the code saved on this device stopped working. */
export const SAVED_CODE_REFUSED = "The stand code saved on this device is no longer right. Enter the new one.";
