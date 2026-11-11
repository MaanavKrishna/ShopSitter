import { currentShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";
import { ownsKey } from "@/lib/shops";

/** Shelf photos are private: only the signed-in owner of that shop can open them. */
export async function GET(_req: Request, ctx: RouteContext<"/api/owner/photos/[key]">) {
  const { key } = await ctx.params;
  const shop = await currentShop();
  // Stored photo names start with the shop they belong to, and belong to that shop alone.
  if (!shop || !ownsKey(shop, key)) return new Response("Not found", { status: 404 });
  const bytes = await getRepo().getPhoto(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Blob([bytes as BlobPart], { type: "image/jpeg" }), {
    headers: { "cache-control": "private, max-age=3600" },
  });
}
