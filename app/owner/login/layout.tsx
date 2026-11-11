import type { Metadata } from "next";

export const metadata: Metadata = { title: "Owner sign-in" };

export default function OwnerLoginLayout({ children }: LayoutProps<"/owner/login">) {
  return children;
}
