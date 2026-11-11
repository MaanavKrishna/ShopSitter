import { redirect } from "next/navigation";
import { SalesView } from "@/components/owner/SalesView";
import { currentShop } from "@/lib/owner-http";

export const metadata = { title: "Sales" };

// A layout is not run again on every move between sections, so each page checks the sign-in itself.
export default async function Page() {
  if (!(await currentShop())) redirect("/owner/login");
  return <SalesView />;
}
