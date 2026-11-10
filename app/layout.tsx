import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible is drawn to stay readable at a distance, which is how the stand screen is read.
const body = Atkinson_Hyperlegible({ variable: "--font-body", subsets: ["latin"], weight: ["400", "700"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shopsitter",
  description: "Minds an unattended stand: the shelf rings up what you take, and you pay with PayPal.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3b33" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
