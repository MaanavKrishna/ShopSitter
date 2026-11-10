import { z } from "zod";
import { ownerRoute } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";

const Body = z.object({
  sku: z.string().regex(/^[a-z0-9-]{1,32}$/),
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  priceCents: z.number().int().min(0).max(1_000_00),
  stock: z.number().int().min(0).max(999),
});

export async function GET() {
  return ownerRoute(async (shop) => ({ products: await getRepo().listProducts(shop) }));
}

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return ownerRoute(async (shop) => {
    const repo = getRepo();
    const existing = (await repo.listProducts(shop)).find((p) => p.sku === parsed.data.sku);
    const product = { ...parsed.data, shop, refImageUrl: existing?.refImageUrl ?? null };
    await repo.upsertProduct(product);
    return { product };
  });
}
