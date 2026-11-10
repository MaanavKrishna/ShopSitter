import { describe, expect, it } from "vitest";
import { priceLines } from "@/lib/money";
import type { VisitRow } from "@/lib/owner";
import { DEMO_PRODUCTS, exampleVisits } from "@/lib/seed";
import { buildStudioData, salesReport, statusLabel } from "@/lib/studio-report";

const page = salesReport.pages[0];
const defined = <T,>(record: Record<string, T | undefined> | undefined) =>
  Object.fromEntries(Object.entries(record ?? {}).filter(([, v]) => v !== undefined)) as Record<string, T>;
const widgets = defined(page.widgets);
const layout = defined(page.widgetLayout);

describe("salesReport", () => {
  it("opens on the sales page", () => {
    expect(salesReport.selectedPageId).toBe(page.id);
  });

  it("holds the three charts and no single-number widgets", () => {
    expect(Object.keys(widgets).sort()).toEqual(["by-day", "by-product", "by-status"]);
    expect(Object.values(widgets).some((w) => w.type === "value")).toBe(false);
  });

  it("places every widget, inside the 24-column canvas", () => {
    expect(Object.keys(layout).sort()).toEqual(Object.keys(widgets).sort());
    for (const box of Object.values(layout)) {
      expect(box.xTrack).toBeGreaterThanOrEqual(0);
      expect(box.xTrack + box.xSpan).toBeLessThanOrEqual(24);
    }
  });

  it("fills each row of the canvas edge to edge without overlaps", () => {
    const boxes = Object.values(layout);
    const overlap = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
      a.xTrack < b.xTrack + b.xSpan &&
      b.xTrack < a.xTrack + a.xSpan &&
      a.yTrack < b.yTrack + b.ySpan &&
      b.yTrack < a.yTrack + a.ySpan;
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(overlap(a, b)).toBe(false);

    const rows = new Map<number, number>();
    for (const b of boxes) rows.set(b.yTrack, (rows.get(b.yTrack) ?? 0) + b.xSpan);
    expect([...rows.values()]).toEqual([24, 24]);
  });

  it("only charts fields that the data provides", () => {
    const rows: VisitRow[] = exampleVisits("demo", Date.UTC(2026, 4, 20)).map((v) => {
      const detectedBill = priceLines(v.detected, DEMO_PRODUCTS);
      return { ...v, detectedBill, detectedCents: detectedBill.totalCents };
    });
    const data = buildStudioData(rows, []);
    const known = new Set(["calendar::day"]);
    for (const source of data.sources ?? []) {
      const fields = "fields" in source ? (source.fields as { id: string }[]) : [];
      for (const f of fields) known.add(`${source.id}.${f.id}`);
    }
    expect(known.size).toBeGreaterThan(10);

    for (const w of Object.values(widgets)) {
      const mapping = w.dataMapping as Record<string, { id: string }[]>;
      for (const refs of Object.values(mapping)) for (const ref of refs) expect(known.has(ref.id)).toBe(true);
    }
  });
});

describe("statusLabel", () => {
  it("names every status in plain words and never accuses", () => {
    const labels = ["open", "paid", "paid_adjusted", "paid_late", "unmatched", "empty", "settled_other"].map(statusLabel);
    expect(labels).toContain("Unmatched");
    expect(labels.join(" ")).not.toMatch(/theft|stolen/i);
  });
});
