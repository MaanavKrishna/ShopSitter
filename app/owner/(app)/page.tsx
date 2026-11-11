import { redirect } from "next/navigation";
import { OverviewView } from "@/components/owner/OverviewView";
import { currentShop } from "@/lib/owner-http";

// A layout is not run again on every move between sections, so each page checks the sign-in itself.
export default async function Page() {
  if (!(await currentShop())) redirect("/owner/login");
  return <OverviewView />;
}
