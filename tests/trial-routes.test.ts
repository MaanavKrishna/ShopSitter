import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  repo: null as unknown,
  jar: new Map<string, string>(),
  cookieOptions: null as Record<string, unknown> | null,
  delta: [] as { sku: string; qty: number }[],
  reads: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.jar.set(name, value);
      state.cookieOptions = options;
    },
    delete: (name: string) => void state.jar.delete(name),
  }),
}));
vi.mock("@/lib/repo", () => ({ getRepo: () => state.repo }));
vi.mock("@/lib/vision", () => ({
  diffShelf: async () => {
    state.reads++;
    return { delta: state.delta, confidence: 0.9 };
  },
}));

import { GET as photoRoute } from "@/app/api/owner/photos/[key]/route";
import { DELETE as archiveRoute } from "@/app/api/owner/products/[sku]/route";
import { POST as productPhotoRoute } from "@/app/api/owner/products/[sku]/photo/route";
import { POST as restockRoute } from "@/app/api/owner/products/[sku]/restock/route";
import { GET as productsRoute, PUT as saveProductRoute } from "@/app/api/owner/products/route";
import { GET as standLinkRoute } from "@/app/api/owner/stand-link/route";
import { POST as visitActionRoute } from "@/app/api/owner/visits/[id]/route";
import { GET as overviewRoute } from "@/app/api/owner/visits/route";
import { POST as angleRoute } from "@/app/api/stand/angle/route";
import { POST as changeRoute } from "@/app/api/stand/change/route";
import { GET as checkRoute } from "@/app/api/stand/check/route";
import { POST as presenceRoute } from "@/app/api/stand/presence/route";
import { DELETE as endTrialRoute, GET as trialRoute, POST as startTrialRoute } from "@/app/api/trial/route";
import { POST as starterPost } from "@/app/api/trial/starter/route";
import { POST as loginRoute } from "@/app/api/owner/login/route";
import { PUT as zonesRoute } from "@/app/api/owner/store/zones/route";
import { GET as billRoute } from "@/app/api/visits/[id]/route";
import { OWNER_COOKIE, ownerCookieValue } from "@/lib/auth";
import { FileRepo } from "@/lib/repo-file";
import { isTrial } from "@/lib/shops";
import { TRIAL_LIFETIME_MS } from "@/lib/trials";
import type { Shop } from "@/lib/types";
import { newVisit } from "@/lib/visits";

const LIVE_CODE = "246810";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let repo: FileRepo;
let ipCount = 0;
const freshIp = () => `10.1.${Math.floor(++ipCount / 250)}.${ipCount % 250}`;

const json = (url: string, method: string, body?: unknown, ip = freshIp()) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "x-forwarded-for": ip, ...(method === "GET" ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const form = (url: string, token: string, fields: Record<string, string | Uint8Array>, ip = freshIp()) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, typeof value === "string" ? value : new File([value as BlobPart], `${name}.jpg`, { type: "image/jpeg" }));
  }
  return new Request(`http://localhost${url}`, { method: "POST", headers: { "x-forwarded-for": ip, "x-stand-token": token }, body: data });
};
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;
const starterRoute = () => starterPost(json("/api/trial/starter", "POST"));
const signIn = (shop: Shop) => state.jar.set(OWNER_COOKIE, ownerCookieValue(shop));
const signOut = () => state.jar.clear();

type Started = { shop: `t-${string}`; expiresAt: number; standKey: string; standLink: string };
async function startTrial(ip = freshIp()): Promise<Started> {
  const res = await startTrialRoute(json("/api/trial", "POST", undefined, ip));
  expect(res.status).toBe(200);
  return (await res.json()) as Started;
}
const product = (sku: string, extra = {}) => ({ sku, name: sku.toUpperCase(), description: "A thing", price: "2.50", stock: 5, create: true, ...extra });
const addProduct = (sku: string) => saveProductRoute(json("/api/owner/products", "PUT", product(sku)));
const change = (token: string, at: number) =>
  changeRoute(form("/api/stand/change", token, { before: JPEG, after: JPEG, changeStartedAt: String(at), settledAt: String(at + 1000) }));

beforeEach(() => {
  process.env.STAND_TOKEN = LIVE_CODE;
  process.env.SESSION_SECRET = "test-secret";
  process.env.OWNER_PASSCODE = "owner-pass";
  process.env.DEMO_PASSCODE = "demo";
  // Placeholders: the gateway is built by the owner visit route but never called in these tests.
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-trial-routes-")));
  state.repo = repo;
  state.jar.clear();
  state.cookieOptions = null;
  state.delta = [];
  state.reads = 0;
});

describe("starting, reading and ending a trial", () => {
  it("starts a trial, signs the browser in to it for 24 hours and hands back its stand link", async () => {
    const before = Date.now();
    const res = await startTrialRoute(json("/api/trial", "POST"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Started;
    expect(isTrial(body.shop)).toBe(true);
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + TRIAL_LIFETIME_MS);
    expect(body.expiresAt).toBeLessThanOrEqual(Date.now() + TRIAL_LIFETIME_MS);
    expect(body.standLink).toBe(`/stand#key=${body.standKey}`);
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "shop", "standKey", "standLink"]);

    expect(state.jar.get(OWNER_COOKIE)).toBe(ownerCookieValue(body.shop));
    expect(state.cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const maxAge = state.cookieOptions!.maxAge as number;
    expect(maxAge).toBeGreaterThan(86_400 - 5);
    expect(maxAge).toBeLessThanOrEqual(86_400);

    const again = await trialRoute();
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(body);
    // A new trial is empty.
    expect(await (await productsRoute()).json()).toEqual({ products: [] });
  });

  it("returns the trial the browser already has instead of making another", async () => {
    const first = await startTrial();
    const second = await startTrial();
    expect(second).toEqual(first);
    expect(await repo.listStored("-trial.json")).toHaveLength(1);
  });

  it("makes a fresh trial when the browser's old one has ended", async () => {
    const first = await startTrial();
    await repo.savePhoto(`${first.shop}-trial.json`, new TextEncoder().encode(JSON.stringify({ shop: first.shop, createdAt: 1, expiresAt: 2 })));
    const second = await startTrial();
    expect(second.shop).not.toBe(first.shop);
    expect(state.jar.get(OWNER_COOKIE)).toBe(ownerCookieValue(second.shop));
  });

  it("lets one caller start three an hour", async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) {
      signOut();
      await startTrial(ip);
    }
    signOut();
    const res = await startTrialRoute(json("/api/trial", "POST", undefined, ip));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "slow_down" });
    expect(state.jar.size).toBe(0);
    // Someone else is not affected.
    await startTrial();
  });

  it("replaces a demo sign-in but never signs the live owner out", async () => {
    signIn("live");
    const refused = await startTrialRoute(json("/api/trial", "POST"));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "owner_signed_in" });
    expect(state.jar.get(OWNER_COOKIE)).toBe(ownerCookieValue("live"));

    signIn("demo");
    const started = await startTrial();
    expect(state.jar.get(OWNER_COOKIE)).toBe(ownerCookieValue(started.shop));
  });

  it("has no current trial for a browser without one, or signed in to live or demo", async () => {
    expect((await trialRoute()).status).toBe(404);
    signIn("live");
    expect((await trialRoute()).status).toBe(404);
    signIn("demo");
    const res = await trialRoute();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_trial" });
  });

  it("ends a trial: its data is deleted and the browser is signed out", async () => {
    const trial = await startTrial();
    await addProduct("mug");
    await repo.saveVisit(newVisit("tv1", trial.shop, [{ sku: "mug", qty: 1 }], Date.now()));
    await repo.savePhoto(`${trial.shop}-1-before.jpg`, JPEG);
    await repo.upsertProduct({ shop: "live", sku: "mug", name: "Live mug", description: "", priceCents: 1, stock: 1, refImageUrl: null });

    const res = await endTrialRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.jar.has(OWNER_COOKIE)).toBe(false);
    expect(await repo.listProducts(trial.shop, { includeArchived: true })).toEqual([]);
    expect(await repo.getVisit("tv1")).toBeNull();
    expect(await repo.getPhoto(`${trial.shop}-1-before.jpg`)).toBeNull();
    expect(await repo.listStored("-trial.json")).toEqual([]);
    expect(await repo.listProducts("live")).toHaveLength(1);

    // The old cookie and the old stand key are dead.
    signIn(trial.shop);
    expect((await trialRoute()).status).toBe(404);
    expect((await productsRoute()).status).toBe(401);
    const check = await checkRoute(new Request("http://localhost/api/stand/check", { headers: { "x-stand-token": trial.standKey } }));
    expect(check.status).toBe(401);
    expect(await check.json()).toEqual({ error: "trial_ended" });
  });

  it("does not end anything for a browser signed in to the live or demo stand", async () => {
    await repo.upsertProduct({ shop: "live", sku: "mug", name: "Live mug", description: "", priceCents: 1, stock: 1, refImageUrl: null });
    for (const shop of ["live", "demo"] as const) {
      signIn(shop);
      const res = await endTrialRoute();
      expect(res.status).toBe(404);
      expect(state.jar.get(OWNER_COOKIE)).toBe(ownerCookieValue(shop));
    }
    expect(await repo.listProducts("live")).toHaveLength(1);
  });
});

describe("the owner area for a trial", () => {
  it("lets a trial add, edit, restock, photograph and remove products", async () => {
    const trial = await startTrial();
    const added = await addProduct("mug");
    expect(added.status).toBe(200);
    expect((await added.json()).product).toMatchObject({ shop: trial.shop, sku: "mug", priceCents: 250, stock: 5 });

    const edited = await saveProductRoute(json("/api/owner/products", "PUT", { sku: "mug", name: "Big mug", description: "Tall", price: "3" }));
    expect((await edited.json()).product).toMatchObject({ name: "Big mug", priceCents: 300, stock: 5 });

    const restocked = await restockRoute(json("/api/owner/products/mug/restock", "POST", { left: 9 }), params({ sku: "mug" }));
    expect((await restocked.json()).left).toBe(9);

    const data = new FormData();
    data.set("photo", new File([JPEG as BlobPart], "mug.jpg", { type: "image/jpeg" }));
    const photo = await productPhotoRoute(new Request("http://localhost/api/owner/products/mug/photo", { method: "POST", body: data }), params({ sku: "mug" }));
    expect(photo.status).toBe(200);
    const ref = (await photo.json()).product.refImageUrl as string;
    expect(ref.startsWith(`${trial.shop}-ref-mug-`)).toBe(true);
    const served = await photoRoute(new Request("http://localhost/x"), params({ key: ref }));
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(JPEG);

    const removed = await archiveRoute(new Request("http://localhost/x", { method: "DELETE" }), params({ sku: "mug" }));
    expect(await removed.json()).toEqual({ deleted: "mug" });
    expect(await (await productsRoute()).json()).toEqual({ products: [] });
    expect(await repo.getPhoto(ref)).toBeNull();
  });

  it("stops a trial at twelve products on sale", async () => {
    await startTrial();
    for (let i = 0; i < 12; i++) expect((await addProduct(`p${i}`)).status).toBe(200);
    const res = await addProduct("p12");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "trial_limit" });
    // Editing one of the twelve still works.
    expect((await saveProductRoute(json("/api/owner/products", "PUT", product("p3", { create: false, price: "9" })))).status).toBe(200);
    // Removing one makes room.
    await archiveRoute(new Request("http://localhost/x", { method: "DELETE" }), params({ sku: "p0" }));
    expect((await addProduct("p12")).status).toBe(200);
  });

  it("adds the suggested products for a trial only", async () => {
    const trial = await startTrial();
    const res = await starterRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added.map((p: { name: string }) => p.name)).toEqual(["Coffee mug", "Notebook", "Pen"]);
    expect(body.products).toHaveLength(3);
    expect((await repo.listProducts(trial.shop)).map((p) => p.sku).sort()).toEqual(["coffee-mug", "notebook", "pen"]);

    for (const shop of ["live", "demo"] as const) {
      signIn(shop);
      const refused = await starterRoute();
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "not_a_trial" });
      expect(await repo.listProducts(shop)).toEqual([]);
    }
    signOut();
    expect((await starterRoute()).status).toBe(401);
  });

  it("tells the screens which kind of stand the overview is for", async () => {
    const trial = await startTrial();
    await addProduct("mug");
    const overview = await (await overviewRoute(json("/api/owner/visits?days=7", "GET"))).json();
    expect(overview.shopKind).toBe("trial");
    expect(overview.visits).toEqual([]);
    expect(overview.products.map((p: { sku: string; shop: string }) => [p.shop, p.sku])).toEqual([[trial.shop, "mug"]]);
    expect(overview.totals.soldCents).toBe(0);

    signIn("live");
    expect((await (await overviewRoute(json("/api/owner/visits", "GET"))).json()).shopKind).toBe("live");
  });

  it("keeps the demo stand's products read-only and the live stand's editable", async () => {
    signIn("demo");
    const demo = await addProduct("mug");
    expect(demo.status).toBe(403);
    expect(await demo.json()).toEqual({ error: "demo_read_only" });
    signIn("live");
    for (let i = 0; i < 14; i++) expect((await addProduct(`p${i}`)).status).toBe(200);
    expect(await repo.listProducts("live")).toHaveLength(14);
  });

  it("signs a trial out everywhere once it has expired", async () => {
    const trial = await startTrial();
    await addProduct("mug");
    await repo.savePhoto(`${trial.shop}-trial.json`, new TextEncoder().encode(JSON.stringify({ shop: trial.shop, createdAt: 1, expiresAt: Date.now() - 1 })));
    expect((await productsRoute()).status).toBe(401);
    expect((await addProduct("pen")).status).toBe(401);
    expect((await overviewRoute(json("/api/owner/visits", "GET"))).status).toBe(401);
    expect((await standLinkRoute()).status).toBe(401);
    expect((await trialRoute()).status).toBe(404);
    expect(await repo.listProducts(trial.shop, { includeArchived: true })).toEqual([]);
  });

  it("keeps one visitor's trial out of another's reach", async () => {
    const a = await startTrial();
    await addProduct("mug");
    await repo.saveVisit({ ...newVisit("va", a.shop, [{ sku: "mug", qty: 1 }], Date.now()), status: "unmatched" });
    const aPhoto = await repo.savePhoto(`${a.shop}-5-before.jpg`, JPEG);
    const livePhoto = await repo.savePhoto("live-5-before.jpg", JPEG);
    const demoPhoto = await repo.savePhoto("demo-5-before.jpg", JPEG);

    signOut();
    const b = await startTrial();
    expect(b.shop).not.toBe(a.shop);
    expect(await (await productsRoute()).json()).toEqual({ products: [] });
    expect((await (await overviewRoute(json("/api/owner/visits", "GET"))).json()).visits).toEqual([]);
    const settle = await visitActionRoute(json("/api/owner/visits/va", "POST", { action: "settle" }), params({ id: "va" }));
    expect(settle.status).toBe(404);
    for (const key of [aPhoto, livePhoto, demoPhoto, `${b.shop}-/../${aPhoto}`, "live-ref-mug.jpg"]) {
      expect((await photoRoute(new Request("http://localhost/x"), params({ key }))).status).toBe(404);
    }

    // And the live and demo owners cannot open a trial's photos.
    for (const shop of ["live", "demo"] as const) {
      signIn(shop);
      expect((await photoRoute(new Request("http://localhost/x"), params({ key: aPhoto }))).status).toBe(404);
    }
    signIn("live");
    expect((await photoRoute(new Request("http://localhost/x"), params({ key: livePhoto }))).status).toBe(200);
    expect((await photoRoute(new Request("http://localhost/x"), params({ key: demoPhoto }))).status).toBe(404);
    signIn(a.shop);
    expect((await photoRoute(new Request("http://localhost/x"), params({ key: aPhoto }))).status).toBe(200);
  });
});

describe("the stand link", () => {
  it("gives a trial a signed key that lasts as long as the trial", async () => {
    const trial = await startTrial();
    const res = await standLinkRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "key", key: trial.standKey, expiresAt: trial.expiresAt, standLink: trial.standLink });
  });

  it("tells the live stand to keep using its code, refuses the demo stand, and needs a sign-in", async () => {
    signIn("live");
    const live = await standLinkRoute();
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ mode: "code" });
    signIn("demo");
    const demo = await standLinkRoute();
    expect(demo.status).toBe(403);
    expect(await demo.json()).toEqual({ error: "demo_no_stand" });
    signOut();
    expect((await standLinkRoute()).status).toBe(401);
  });
});

describe("stand devices", () => {
  const check = (token: string) =>
    checkRoute(new Request("http://localhost/api/stand/check", { headers: { "x-stand-token": token, "x-forwarded-for": freshIp() } }));

  it("checks a live code and a trial key, and says which kind of stand each is", async () => {
    const trial = await startTrial();
    const live = await check(LIVE_CODE);
    expect(live.status).toBe(204);
    expect(live.headers.get("x-stand-kind")).toBe("live");
    expect(live.headers.get("x-stand-expires-at")).toBeNull();

    const mine = await check(trial.standKey);
    expect(mine.status).toBe(204);
    expect(mine.headers.get("x-stand-kind")).toBe("trial");
    expect(mine.headers.get("x-stand-expires-at")).toBe(String(trial.expiresAt));

    const [shop, exp, mac] = trial.standKey.split(".");
    for (const forged of [`live.${exp}.${mac}`, `${shop}.${exp}.${mac.split("").reverse().join("")}`, `${shop}.${exp}`]) {
      const res = await check(forged);
      expect(res.status).toBe(401);
      expect(res.headers.get("x-stand-kind")).toBeNull();
    }
  });

  it("files a trial stand's shelf change under the trial, priced from its catalogue", async () => {
    const trial = await startTrial();
    await addProduct("mug");
    await repo.upsertProduct({ shop: "live", sku: "mug", name: "Live mug", description: "", priceCents: 9900, stock: 5, refImageUrl: null });
    state.delta = [{ sku: "mug", qty: 2 }];
    const at = Date.now();

    const res = await change(trial.standKey, at);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visit.shop).toBe(trial.shop);
    expect(body.bill.totalCents).toBe(500);
    expect(body.cameras).toBe(1);
    expect(body.visit.beforeUrl.startsWith(`${trial.shop}-`)).toBe(true);
    expect(await repo.getPhoto(body.visit.afterUrl)).toEqual(JPEG);
    expect(await repo.getOpenVisit("live")).toBeNull();

    // The pay page prices it from the trial's catalogue.
    const bill = await (await billRoute(json(`/api/visits/${body.visit.id}`, "GET"), params({ id: body.visit.id }))).json();
    expect(bill.bill.totalCents).toBe(500);
    expect(bill.products).toEqual([{ sku: "mug", name: "MUG", priceCents: 250 }]);

    // The owner area lists it, with its photos.
    const overview = await (await overviewRoute(json("/api/owner/visits", "GET"))).json();
    expect(overview.visits.map((v: { id: string }) => v.id)).toEqual([body.visit.id]);
    expect((await photoRoute(new Request("http://localhost/x"), params({ key: body.visit.beforeUrl }))).status).toBe(200);
  });

  it("files the live stand's shelf change under the live stand, as before", async () => {
    const trial = await startTrial();
    await addProduct("mug");
    await repo.upsertProduct({ shop: "live", sku: "mug", name: "Live mug", description: "", priceCents: 9900, stock: 5, refImageUrl: null });
    state.delta = [{ sku: "mug", qty: 1 }];
    const res = await change(LIVE_CODE, Date.now());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visit.shop).toBe("live");
    expect(body.bill.totalCents).toBe(9900);
    expect(body.visit.beforeUrl).toMatch(/^live-\d+-before\.jpg$/);
    expect(await repo.getOpenVisit(trial.shop)).toBeNull();
  });

  it("refuses a shelf change with a forged key before anything is read or stored", async () => {
    const trial = await startTrial();
    await addProduct("mug");
    state.delta = [{ sku: "mug", qty: 1 }];
    const [shop, exp, mac] = trial.standKey.split(".");
    for (const forged of [`live.${exp}.${mac}`, `${shop}.${(Date.now() * 2).toString(36)}.${mac}`]) {
      expect((await change(forged, Date.now())).status).toBe(401);
    }
    expect(state.reads).toBe(0);
    expect(await repo.listVisits("live")).toEqual([]);
    expect(await repo.listVisits(trial.shop)).toEqual([]);
  });

  it("caps a trial at sixty shelf reads a day and leaves the live stand uncapped", async () => {
    const trial = await startTrial();
    // Stand times must sit near the server's clock, so the reads are spread over the last few minutes.
    const at = Date.now() - 150_000;
    for (let i = 0; i < 60; i++) expect((await change(trial.standKey, at + i * 2000)).status).toBe(200);
    const capped = await change(trial.standKey, at + 140_000);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "trial_read_limit" });
    expect(state.reads).toBe(60);
    for (let i = 0; i < 70; i++) expect((await change(LIVE_CODE, at + i * 2000)).status).toBe(200);
    expect(state.reads).toBe(130);
  });

  it("takes smaller stills from a trial stand than from the live stand", async () => {
    const trial = await startTrial();
    const big = new Uint8Array(1_200_000);
    big.set(JPEG);
    const at = String(Date.now());
    const send = (token: string) =>
      changeRoute(form("/api/stand/change", token, { before: big, after: JPEG, changeStartedAt: at, settledAt: at }));
    const refused = await send(trial.standKey);
    expect(refused.status).toBe(413);
    expect(await refused.json()).toEqual({ error: "photo_too_large" });
    expect(state.reads).toBe(0);
    const still = await angleRoute(form("/api/stand/angle", trial.standKey, { photo: big, angle: "2", takenAt: at }));
    expect(still.status).toBe(413);
    expect((await send(LIVE_CODE)).status).toBe(200);
    expect((await angleRoute(form("/api/stand/angle", LIVE_CODE, { photo: big, angle: "2", takenAt: at }))).status).toBe(200);
  });

  it("counts people and stores extra-camera stills for the stand the key belongs to", async () => {
    const trial = await startTrial();
    const day = new Date().toISOString().slice(0, 10);
    const post = (token: string) =>
      presenceRoute(new Request("http://localhost/api/stand/presence", { method: "POST", headers: { "x-stand-token": token, "x-forwarded-for": freshIp() } }));
    expect((await post(trial.standKey)).status).toBe(200);
    expect((await post(trial.standKey)).status).toBe(200);
    expect((await post(LIVE_CODE)).status).toBe(200);
    const count = async (shop: string) => JSON.parse(new TextDecoder().decode((await repo.getPhoto(`${shop}-footfall-${day}.json`))!)).count;
    expect(await count(trial.shop)).toBe(2);
    expect(await count("live")).toBe(1);

    const still = (token: string) => angleRoute(form("/api/stand/angle", token, { photo: JPEG, angle: "2", takenAt: String(Date.now()) }));
    expect((await still(trial.standKey)).status).toBe(200);
    expect(await repo.getPhoto(`${trial.shop}-angle-2-latest.jpg`)).toEqual(JPEG);
    expect(await repo.getPhoto("live-angle-2-latest.jpg")).toBeNull();
    expect((await still(LIVE_CODE)).status).toBe(200);
    expect(await repo.getPhoto("live-angle-2-latest.jpg")).toEqual(JPEG);
  });
});

describe("JSON-only writes", () => {
  const plain = (url: string, method: string, body: string) =>
    new Request(`http://localhost${url}`, { method, headers: { "x-forwarded-for": freshIp(), "content-type": "text/plain" }, body });

  it("refuses a sign-in sent as a plain-text form body, so another site cannot sign a browser in", async () => {
    const res = await loginRoute(plain("/api/owner/login", "POST", JSON.stringify({ passcode: "demo" })));
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_media_type" });
    expect(state.jar.has(OWNER_COOKIE)).toBe(false);
    expect((await loginRoute(json("/api/owner/login", "POST", { passcode: "demo" }))).status).toBe(200);
  });

  it("refuses owner writes and a trial start that are not JSON", async () => {
    signIn("live");
    expect((await zonesRoute(plain("/api/owner/store/zones", "PUT", JSON.stringify({ zones: [] })))).status).toBe(415);
    expect((await visitActionRoute(plain("/api/owner/visits/x", "POST", JSON.stringify({ action: "settle" })), params({ id: "x" }))).status).toBe(415);
    signOut();
    expect((await startTrialRoute(plain("/api/trial", "POST", ""))).status).toBe(415);
  });
});

describe("stand times", () => {
  it("refuses a change dated in the future or held back for too long", async () => {
    const now = Date.now();
    expect((await change(LIVE_CODE, now + 5 * 60_000)).status).toBe(400);
    expect((await change(LIVE_CODE, now - 20 * 60_000)).status).toBe(400);
    expect((await change(LIVE_CODE, now - 5_000)).status).toBe(200);
    // A change carried forward after a failed send keeps its old start but has a fresh end.
    const carried = await changeRoute(
      form("/api/stand/change", LIVE_CODE, { before: JPEG, after: JPEG, changeStartedAt: String(now - 30 * 60_000), settledAt: String(now) }),
    );
    expect(carried.status).toBe(200);
  });
});

