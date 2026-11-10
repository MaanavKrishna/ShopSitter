import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// Studio Void: cobalt accent, white working surfaces, Inter for reading and Inter Tight for headings.
export const voidTheme = defineTheme({
  name: "void",
  extends: neutralTheme,
  color: { accent: ["#0a35c8", "#0a35c8"], neutralStyle: "cool" },
  typography: {
    scale: { base: 16, ratio: 1.2 },
    body: { family: "Inter", fallbacks: "var(--font-body), system-ui, sans-serif" },
    heading: { family: "Inter Tight", fallbacks: "var(--font-display), var(--font-body), sans-serif" },
  },
  radius: { base: 10, multiplier: 1 },
  // Exact brand values: the generated scales drift from the cobalt and round too far.
  tokens: {
    "--color-accent": ["#0a35c8", "#0a35c8"],
    "--color-background-body": ["#f1f4ff", "#f1f4ff"],
    "--color-background-surface": ["#ffffff", "#ffffff"],
    "--color-background-card": ["#ffffff", "#ffffff"],
    "--color-text-primary": ["#0a1024", "#0a1024"],
    "--radius-inner": "8px",
    "--radius-element": "12px",
    "--radius-container": "16px",
    "--radius-page": "24px",
    "--radius-chat": "24px",
  },
});
