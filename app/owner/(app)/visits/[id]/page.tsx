import { redirect } from "next/navigation";
import { VisitDetailView } from "@/components/owner/VisitDetailView";
import { currentShop } from "@/lib/owner-http";
import { signedOutPath } from "../../signed-out";

export const metadata = { title: "Visit" };

export default async function Page({ params }: PageProps<"/owner/visits/[id]">) {
  if (!(await currentShop())) redirect(await signedOutPath());
  const { id } = await params;
  return <VisitDetailView id={id} />;
}
