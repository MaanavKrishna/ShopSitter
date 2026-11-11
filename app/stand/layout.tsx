import type { Metadata } from "next";

export const metadata: Metadata = { title: "Stand screen", robots: { index: false } };

export default function StandLayout({ children }: LayoutProps<"/stand">) {
  return children;
}
