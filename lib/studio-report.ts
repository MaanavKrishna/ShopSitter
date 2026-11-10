// What AG Studio shows on the owner dashboard: three tables built from visits, and a ready-made
// "Sales" page so the owner sees charts on first load and can still rearrange or add their own.

import type { AgDataSourcesDefinition, AgReportState, AgWidgetLayoutState } from "ag-studio";
import type { StockRow, VisitRow } from "./owner";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  paid: "Paid",
  paid_adjusted: "Paid (adjusted)",
  paid_late: "Paid late",
  unmatched: "Unmatched",
  empty: "Nothing taken",
  settled_other: "Settled another way",
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

const dollars = (cents: number) => cents / 100;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function buildStudioData(visits: VisitRow[], stock: StockRow[]): AgDataSourcesDefinition {
  const shown = visits.filter((v) => v.status !== "empty");
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
          adjusted: v.status === "paid_adjusted" ? dollars(Math.max(0, v.detectedCents - (v.paidCents ?? 0))) : 0,
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
        data: shown.flatMap((v) =>
          v.detectedBill.lines.map((l) => ({
            visitId: v.id,
            product: l.name,
            quantity: l.qty,
            value: dollars(l.lineCents),
          })),
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
const kpi = (text: string, field: string) => ({
  type: "value" as const,
  dataMapping: { value: [sum(field)] },
  format: title(text),
});

export const salesReport: AgReportState = {
  selectedPageId: "sales",
  pages: [
    {
      id: "sales",
      widgets: {
        "kpi-taken": kpi("Taken from the shelf", "visits.taken"),
        "kpi-paid": kpi("Paid through PayPal", "visits.paid"),
        "kpi-unmatched": kpi("Unmatched", "visits.unmatched"),
        "kpi-adjusted": kpi("Adjusted by customers", "visits.adjusted"),
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
        "stock-left": {
          type: "grid",
          dataMapping: { cols: [{ id: "stock.product" }, sum("stock.left")] },
          format: title("Left on the shelf"),
        },
      },
      widgetLayout: {
        "kpi-taken": at(0, 0, 6, 7),
        "kpi-paid": at(6, 0, 6, 7),
        "kpi-unmatched": at(12, 0, 6, 7),
        "kpi-adjusted": at(18, 0, 6, 7),
        "by-day": at(0, 7, 15, 18),
        "by-status": at(15, 7, 9, 18),
        "by-product": at(0, 25, 15, 18),
        "stock-left": at(15, 25, 9, 18),
      },
    },
  ],
};
