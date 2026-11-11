import { redirect } from "next/navigation";
import { VisitDetailView } from "@/components/owner/VisitDetailView";
import { currentShop } from "@/lib/owner-http";

export default async function Page({ params }: PageProps<"/owner/visits/[id]">) {
  if (!(await currentShop())) redirect("/owner/login");
  const { id } = await params;
  return <VisitDetailView id={id} />;
}
