import { redirect } from "next/navigation";
import { OwnerDashboard } from "@/components/owner/OwnerDashboard";
import { ownerOverview } from "@/lib/owner";
import { currentShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";

export const metadata = { title: "Shopsitter — your stand" };

const loadOverview = (shop: "live" | "demo") => ownerOverview(getRepo(), shop, 7, Date.now());

export default async function OwnerPage() {
  const shop = await currentShop();
  if (!shop) redirect("/owner/login");
  return <OwnerDashboard shop={shop} initial={await loadOverview(shop)} />;
}
