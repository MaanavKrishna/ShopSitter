"use client";

import { Theme } from "@astryxdesign/core/theme";
import type { ReactNode } from "react";
import { voidTheme } from "@/themes/void/void";

/** Applies the Studio Void theme to every design-system component. The app is light only. */
export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <Theme theme={voidTheme} mode="light">
      {children}
    </Theme>
  );
}
