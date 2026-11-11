import { redirect } from "next/navigation";
import { OwnerProvider } from "@/components/owner/OwnerProvider";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { healDemo } from "@/lib/demo-reset";
import { ownerOverview } from "@/lib/owner";
import { currentShop } from "@/lib/owner-http";
import { signedOutPath } from "./signed-out";
import { getRepo } from "@/lib/repo";
import type { Shop } from "@/lib/types";

export const metadata = { title: "Your stand" };

async function loadOverview(shop: Shop) {
  const repo = getRepo();
  const now = Date.now();
  // The demo stand puts itself back to the example week once an hour; a failed reset never blocks the dashboard.
  if (shop === "demo") await healDemo(repo, now).catch((e) => console.error("demo reset failed", e));
  return ownerOverview(repo, shop, 7, now);
}

// The shell and the stand's figures load once here and stay put while the owner moves between sections.
export default async function OwnerLayout({ children }: LayoutProps<"/owner">) {
  const shop = await currentShop();
  if (!shop) redirect(await signedOutPath());
  const initial = await loadOverview(shop);
  return (
    <OwnerProvider shop={shop} initial={initial}>
      <OwnerShell>{children}</OwnerShell>
    </OwnerProvider>
  );
}
