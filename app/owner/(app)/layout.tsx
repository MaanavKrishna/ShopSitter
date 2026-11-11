import { redirect } from "next/navigation";
import { OwnerProvider } from "@/components/owner/OwnerProvider";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { ownerOverview } from "@/lib/owner";
import { currentShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";

export const metadata = { title: "Shopsitter — your stand" };

const loadOverview = (shop: "live" | "demo") => ownerOverview(getRepo(), shop, 7, Date.now());

// The shell and the stand's figures load once here and stay put while the owner moves between sections.
export default async function OwnerLayout({ children }: LayoutProps<"/owner">) {
  const shop = await currentShop();
  if (!shop) redirect("/owner/login");
  const initial = await loadOverview(shop);
  return (
    <OwnerProvider shop={shop} initial={initial}>
      <OwnerShell>{children}</OwnerShell>
    </OwnerProvider>
  );
}
