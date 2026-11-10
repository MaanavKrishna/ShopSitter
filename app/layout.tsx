import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Shrikhand } from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible is drawn to stay readable at a distance, which is how the stand screen is read.
const body = Atkinson_Hyperlegible({ variable: "--font-body", subsets: ["latin"], weight: ["400", "700"] });
// Shrikhand's fat slanted strokes are the nearest thing in type to a chisel marker on a price card.
const marker = Shrikhand({ variable: "--font-marker", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Shopsitter — the stand that rings you up",
  description:
    "Shopsitter minds an unattended stand. A phone camera counts what you take, your bill appears, and you pay with PayPal.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b6b3a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${marker.variable}`}>
      <body>{children}</body>
    </html>
  );
}
