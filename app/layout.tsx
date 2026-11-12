import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./layers.css";
import "./globals.css";
import "./system.css";
import { AppTheme } from "@/components/AppTheme";

// One family in two cuts: Inter for reading, Inter Tight for headlines and every figure of money.
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const display = Inter_Tight({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://shopsitter.vercel.app"),
  title: { default: "Shopsitter: the stand that rings you up", template: "%s | Shopsitter" },
  openGraph: { siteName: "Shopsitter", type: "website" },
  twitter: { card: "summary_large_image" },
  description:
    "Walk-out checkout for any shop, from a market stall to a supermarket aisle, using the cameras it already has. A camera on each shelf counts what you take, your bill appears, and you pay with PayPal.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a35c8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <AppTheme>{children}</AppTheme>
      </body>
    </html>
  );
}
