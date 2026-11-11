import { redirect } from "next/navigation";
import { ShelfView } from "@/components/owner/ShelfView";
import { currentShop } from "@/lib/owner-http";

export const metadata = { title: "Shelf" };

// A layout is not run again on every move between sections, so each page checks the sign-in itself.
export default async function Page() {
  if (!(await currentShop())) redirect("/owner/login");
  return <ShelfView />;
}
