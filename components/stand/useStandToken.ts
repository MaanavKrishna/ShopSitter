"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "shopsitter-stand-token";

/**
 * The stand code this device was set up with. The main stand screen and every extra camera
 * on the same device share it. `booted` turns true once the saved code has been looked up,
 * so a set-up device never flashes the set-up sheet.
 */
export function useStandToken() {
  const [token, setToken] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    // Read after mount so the server render matches.
    const saved = localStorage.getItem(TOKEN_KEY);
    queueMicrotask(() => {
      if (saved) setToken(saved);
      setBooted(true);
    });
  }, []);

  const save = useCallback((code: string) => {
    localStorage.setItem(TOKEN_KEY, code);
    setToken(code);
  }, []);

  /** The server refused the code: drop it so the set-up sheet comes back. */
  const forget = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return { token, booted, save, forget };
}
