import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { STAND_CALLER_FAILS, STAND_GLOBAL_FAILS, createStandGate, type StandGate } from "@/lib/auth";
import { FileRepo } from "@/lib/repo-file";
import {
  TRIAL_READS_ALL_PER_DAY,
  TRIAL_READS_PER_DAY,
  createTrialReadGate,
  resolveStand,
} from "@/lib/stand-access";
import { signStandKey } from "@/lib/stand-key";
import { createTrial, endTrial, type Trial } from "@/lib/trials";

const LIVE_CODE = "246810";
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

let repo: FileRepo;
let gate: StandGate;
let trial: Trial;
let key: string;

const request = (token: string | null, ip = "9.9.9.9") =>
  new Request("http://localhost/api/stand/check", {
    headers: { "x-forwarded-for": ip, ...(token === null ? {} : { "x-stand-token": token }) },
  });
const resolve = (token: string | null, ip?: string, now = NOW) => resolveStand(request(token, ip), { repo, gate, now });
const refusal = async (r: Awaited<ReturnType<typeof resolve>>) => {
  if (!(r instanceof Response)) throw new Error(`expected a refusal, got ${JSON.stringify(r)}`);
  return { status: r.status, body: await r.json() };
};

beforeEach(async () => {
  process.env.STAND_TOKEN = LIVE_CODE;
  process.env.SESSION_SECRET = "test-secret";
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-access-")));
  gate = createStandGate();
  trial = await createTrial(repo, NOW);
  key = signStandKey(trial.shop, trial.expiresAt);
});

describe("who a stand request acts for", () => {
  it("resolves the live stand's code to the live stand, as before", async () => {
    expect(await resolve(LIVE_CODE)).toEqual({ shop: "live", kind: "live" });
    expect(await resolve(` ${LIVE_CODE} `)).toEqual({ shop: "live", kind: "live" });
  });

  it("refuses a wrong or missing code with 401, as before", async () => {
    expect(await refusal(await resolve("000000"))).toEqual({ status: 401, body: { error: "unauthorized" } });
    expect(await refusal(await resolve(null))).toEqual({ status: 401, body: { error: "unauthorized" } });
    expect(await refusal(await resolve(""))).toEqual({ status: 401, body: { error: "unauthorized" } });
  });

  it("limits a caller after five wrong codes and then refuses the right code too, as before", async () => {
    for (let i = 0; i < STAND_CALLER_FAILS; i++) await resolve("000000", "5.5.5.5");
    expect(await refusal(await resolve(LIVE_CODE, "5.5.5.5"))).toEqual({ status: 429, body: { error: "slow_down" } });
    expect(await resolve(LIVE_CODE, "6.6.6.6")).toEqual({ shop: "live", kind: "live" });
  });

  it("resolves a trial's key to that trial and to nothing else", async () => {
    expect(await resolve(key)).toEqual({ shop: trial.shop, kind: "trial", expiresAt: trial.expiresAt });
    const other = await createTrial(repo, NOW);
    const otherKey = signStandKey(other.shop, other.expiresAt);
    expect(await resolve(otherKey)).toEqual({ shop: other.shop, kind: "trial", expiresAt: other.expiresAt });
  });

  it("refuses a tampered key and counts it as a wrong code", async () => {
    const [shop, exp, mac] = key.split(".");
    const forged = [`live.${exp}.${mac}`, `t-zyxwvu2345.${exp}.${mac}`, `${shop}.${exp}.${"A".repeat(mac.length)}`];
    for (const f of forged) expect(await refusal(await resolve(f, "7.7.7.7"))).toEqual({ status: 401, body: { error: "unauthorized" } });
    for (let i = forged.length; i < STAND_CALLER_FAILS; i++) await resolve("nope", "7.7.7.7");
    // Five wrong tries from this caller: the live code is now refused from it too.
    expect((await refusal(await resolve(LIVE_CODE, "7.7.7.7"))).status).toBe(429);
  });

  it("refuses a real key once its trial has expired or been ended, without counting it as a guess", async () => {
    const late = NOW + DAY + 1;
    for (let i = 0; i < STAND_CALLER_FAILS + 3; i++) {
      expect(await refusal(await resolve(key, "8.8.8.8", late))).toEqual({ status: 401, body: { error: "trial_ended" } });
    }
    // The same address can still run the live stand.
    expect(await resolve(LIVE_CODE, "8.8.8.8", late)).toEqual({ shop: "live", kind: "live" });

    const other = await createTrial(repo, NOW);
    const otherKey = signStandKey(other.shop, other.expiresAt);
    await endTrial(repo, other.shop);
    expect(await refusal(await resolve(otherKey))).toEqual({ status: 401, body: { error: "trial_ended" } });
  });

  it("refuses a key whose own expiry is later than the trial it names", async () => {
    // A key can only be minted by the server, but the stored trial is still the one that decides.
    const long = signStandKey(trial.shop, trial.expiresAt + 30 * DAY);
    expect(await refusal(await resolve(long, "9.9.9.1", trial.expiresAt + 1))).toEqual({ status: 401, body: { error: "trial_ended" } });
  });

  it("keeps a trial stand working while guessers have the live code's limits tripped", async () => {
    for (let i = 0; i < STAND_GLOBAL_FAILS; i++) await resolve("000000", `bot-${i}`);
    for (let i = 0; i < STAND_CALLER_FAILS; i++) await resolve("000000", "4.4.4.4");
    // A trial key cannot be guessed, so it is not held back by limits that protect the short live code.
    expect(await resolve(key, "4.4.4.4")).toEqual({ shop: trial.shop, kind: "trial", expiresAt: trial.expiresAt });
    expect(await resolve(key, "new-caller")).toEqual({ shop: trial.shop, kind: "trial", expiresAt: trial.expiresAt });
    // Holding a trial key does not get anyone past the limits on the live code.
    expect((await refusal(await resolve(LIVE_CODE, "4.4.4.4"))).status).toBe(429);
    expect((await refusal(await resolve(LIVE_CODE, "new-caller"))).status).toBe(429);
  });

  it("never lets a trial key act as the live stand, even when no live code is configured", async () => {
    delete process.env.STAND_TOKEN;
    expect(await resolve(key)).toEqual({ shop: trial.shop, kind: "trial", expiresAt: trial.expiresAt });
    expect((await refusal(await resolve(""))).status).toBe(401);
  });
});

describe("trial shelf read caps", () => {
  it("allows sixty reads per trial per day", () => {
    const reads = createTrialReadGate();
    expect(TRIAL_READS_PER_DAY).toBe(60);
    for (let i = 0; i < 60; i++) expect(reads("t-aaaaaaaaaa", NOW + i)).toBe("ok");
    expect(reads("t-aaaaaaaaaa", NOW + 100)).toBe("trial_read_limit");
    expect(reads("t-bbbbbbbbbb", NOW + 101)).toBe("ok");
    expect(reads("t-aaaaaaaaaa", NOW + DAY + 100)).toBe("ok");
  });

  it("caps reads across every trial, and a refused read uses up nothing", () => {
    const reads = createTrialReadGate();
    expect(TRIAL_READS_ALL_PER_DAY).toBe(600);
    for (let i = 0; i < 600; i++) expect(reads(`t-${String(i % 20).padStart(10, "a")}`, NOW + i)).toBe("ok");
    expect(reads("t-cccccccccc", NOW + 700)).toBe("trial_busy");
    expect(reads("t-cccccccccc", NOW + DAY + 700)).toBe("ok");
  });
});
