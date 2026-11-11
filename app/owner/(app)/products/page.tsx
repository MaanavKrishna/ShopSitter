import { redirect } from "next/navigation";
import { ProductsView } from "@/components/owner/ProductsView";
import { currentShop } from "@/lib/owner-http";

export const metadata = { title: "Products" };

// A layout is not run again on every move between sections, so each page checks the sign-in itself.
export default async function Page() {
  if (!(await currentShop())) redirect("/owner/login");
  return <ProductsView />;
}
