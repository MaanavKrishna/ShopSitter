// What AG Studio shows on the owner dashboard: three tables built from visits, and a ready-made
// "Sales" page so the owner sees charts on first load and can still rearrange or add their own.

import type { AgDataSourcesDefinition, AgReportState, AgWidgetLayoutState } from "ag-studio";
import type { StockRow, VisitRow } from "./owner";
import { isAdjusted } from "./visits";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  paid: "Paid",
  paid_adjusted: "Paid (adjusted)",
  paid_late: "Paid late",
  unmatched: "Unmatched",
  empty: "Nothing taken",
  settled_other: "Settled another way",
};
const STATUS_ORDER = ["paid", "unmatched", "paid_adjusted", "settled_other", "paid_late", "open"];
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

const dollars = (cents: number) => cents / 100;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type ItemRow = { visitId: string; product: string; quantity: number; value: number };

/** Rows grouped so the product with the most value comes first, which is the order the chart draws them in. */
function bestSellersFirst(rows: ItemRow[]): ItemRow[] {
  const total = new Map<string, number>();
  for (const r of rows) total.set(r.product, (total.get(r.product) ?? 0) + r.value);
  return [...rows].sort((a, b) => total.get(b.product)! - total.get(a.product)! || a.product.localeCompare(b.product));
}

export function buildStudioData(visits: VisitRow[], stock: StockRow[]): AgDataSourcesDefinition {
  // Charts colour categories in the order they first appear, so visits are listed by status first:
  // paid (cobalt), unmatched (coral), adjusted (yellow), then the quieter ones.
  const shown = visits
    .filter((v) => v.status !== "empty")
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.openedAt - b.openedAt);
  const days = shown.map((v) => day(v.openedAt)).sort();
  const today = day(Date.now());

  return {
    description:
      "Visits to an unattended stand. Each visit is what a camera saw one person take from the shelf, " +
      "and whether they paid for it through PayPal. Money is in US dollars.",
    sources: [
      {
        id: "visits",
        description: "One row per visit. 'Unmatched' means items left the shelf and no payment arrived.",
        data: shown.map((v) => ({
          id: v.id,
          day: day(v.openedAt),
          time: new Date(v.openedAt).toISOString().slice(11, 16),
          status: statusLabel(v.status),
          items: v.detectedBill.lines.map((l) => `${l.qty} × ${l.name}`).join(", "),
          taken: dollars(v.detectedCents),
          paid: dollars(v.paidCents ?? 0),
          unmatched: v.status === "unmatched" ? dollars(v.detectedCents) : 0,
          adjusted: isAdjusted(v) ? dollars(Math.max(0, v.detectedCents - (v.paidCents ?? 0))) : 0,
          refunded: dollars(v.refundedCents),
        })),
        fields: [
          { id: "id", name: "Visit", format: "textFormat", hide: true },
          { id: "day", name: "Day", format: "dateFormat" },
          { id: "time", name: "Time (UTC)", format: "textFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "items", name: "Items", format: "textFormat" },
          { id: "taken", name: "Taken", format: "currencyFormat" },
          { id: "paid", name: "Paid", format: "currencyFormat" },
          { id: "unmatched", name: "Unmatched", format: "currencyFormat" },
          { id: "adjusted", name: "Adjusted by customer", format: "currencyFormat" },
          { id: "refunded", name: "Refunded", format: "currencyFormat" },
        ],
      },
      {
        id: "items",
        description: "One row per product in a visit.",
        data: bestSellersFirst(
          shown.flatMap((v) =>
            v.detectedBill.lines.map((l) => ({
              visitId: v.id,
              product: l.name,
              quantity: l.qty,
              value: dollars(l.lineCents),
            })),
          ),
        ),
        fields: [
          { id: "visitId", name: "Visit", format: "textFormat", hide: true },
          { id: "product", name: "Product", format: "textFormat" },
          { id: "quantity", name: "Quantity", format: "integerFormat" },
          { id: "value", name: "Value", format: "currencyFormat" },
        ],
      },
      {
        id: "stock",
        description: "What should still be on the shelf.",
        data: stock.map((s) => ({ product: s.name, left: s.left })),
        fields: [
          { id: "product", name: "Product", format: "textFormat" },
          { id: "left", name: "Left on shelf", format: "integerFormat" },
        ],
      },
    ],
    relationships: [
      {
        id: "items-visit",
        source: { tableId: "items", fieldId: "visitId" },
        target: { tableId: "visits", fieldId: "id" },
        type: "many-to-one",
      },
      { id: "visits-day-calendar", source: { tableId: "visits", fieldId: "day" }, target: { calendarId: "calendar" } },
    ],
    calendars: [
      {
        id: "calendar",
        label: "Calendar",
        range: {
          from: { type: "date", value: days[0] ?? today },
          to: { type: "date", value: days.at(-1) ?? today },
        },
        fragments: ["month", "week", "day", "dayOfWeek"],
      },
    ],
  };
}

// Position on Studio's 24-column canvas.
const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan,
});
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });

// The headline figures live in the band at the top of the dashboard, so the board holds charts only.
export const salesReport: AgReportState = {
  selectedPageId: "sales",
  pages: [
    {
      id: "sales",
      widgets: {
        "by-day": {
          type: "column-chart-stacked",
          dataMapping: {
            categoryKey: [{ id: "calendar::day" }],
            valueKey: [sum("visits.paid"), sum("visits.unmatched"), sum("visits.adjusted")],
          },
          format: title("Paid, unmatched and adjusted by day"),
        },
        "by-status": {
          type: "donut-chart",
          dataMapping: { categoryKey: [{ id: "visits.status" }], valueKey: [sum("visits.taken")] },
          format: title("Value by how the visit ended"),
        },
        "by-product": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "items.product" }], valueKey: [sum("items.value")] },
          format: title("What sells"),
        },
      },
      widgetLayout: {
        "by-day": at(0, 0, 14, 22),
        "by-status": at(14, 0, 10, 22),
        "by-product": at(0, 22, 24, 21),
      },
    },
  ],
};
