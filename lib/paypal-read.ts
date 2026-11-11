// Read-only PayPal lookups for "Ask your stand", made through PayPal's Agent Toolkit.
// Only actions that read are switched on, and the toolkit is pointed at the sandbox.

import { z } from "zod";
import { type AskData, type AskTool, type Clock, type Source, type ToolResult, parseAmount, usd } from "./ask";

/** The toolkit actions in use. Nothing here creates, captures, refunds, sends or changes anything. */
export const ENABLED_ACTIONS = { orders: { get: true }, transactions: { list: true } };

/** Raw answers from PayPal, as the toolkit returns them. */
export type PayPalReader = {
  getOrder(orderId: string): Promise<unknown>;
  listTransactions(startIso: string, endIso: string): Promise<unknown>;
};

const TIMEOUT_MS = 8_000;
const MAX_TRANSACTIONS = 10;
const ORDER_ID = /^[A-Z0-9]{17,32}$/;
const SOURCE: Source = { kind: "paypal", label: "PayPal sandbox" };

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === "object" && v !== null ? (v as Rec) : {});
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** A PayPal amount such as "19.00" or "-5.00", formatted the way the rest of the app writes money. */
function money(amount: unknown): string | null {
  const value = text(rec(amount).value);
  if (value === null) return null;
  const cents = parseAmount(value.replace(/^-/, ""));
  if (cents === null) return null;
  return `${value.startsWith("-") ? "-" : ""}${usd(cents)}`;
}

function refusal(raw: Rec): string {
  if (raw.status === 404) return "PayPal has no order with that id.";
  if (raw.status === 401 || raw.status === 403) return "PayPal did not allow this lookup for the stand's sandbox app.";
  return "PayPal could not be read just now.";
}

/** A PayPal order cut down to its status, amount, captures and refunds. */
export function shapeOrder(raw: unknown): Record<string, unknown> {
  const order = rec(raw);
  if (order.ok === false || !text(order.id) || !text(order.status)) return { found: false, reason: refusal(order) };
  const units = list(order.purchase_units);
  const payments = units.map((u) => rec(u.payments));
  const part = (p: Rec) => ({ id: text(p.id), status: text(p.status), amount: money(p.amount) });
  return {
    found: true,
    order_id: order.id,
    status: order.status,
    amount: money(units[0]?.amount),
    ...(text(order.create_time) ? { created: order.create_time } : {}),
    ...(units.some((u) => Array.isArray(u.items))
      ? { items: units.flatMap((u) => list(u.items)).map((i) => `${text(i.quantity) ?? "1"} × ${text(i.name) ?? "item"}`) }
      : {}),
    captures: payments.flatMap((p) => list(p.captures)).map(part),
    refunds: payments.flatMap((p) => list(p.refunds)).map(part),
  };
}

/** PayPal's transaction list for a date range, cut down to id, status, amount and time. */
export function shapeTransactions(raw: unknown): Record<string, unknown> {
  const body = rec(raw);
  if (body.ok === false || !Array.isArray(body.transaction_details)) return { available: false, reason: refusal(body) };
  const rows = list(body.transaction_details).map((d) => rec(d.transaction_info));
  return {
    available: true,
    count: rows.length,
    transactions: rows.slice(0, MAX_TRANSACTIONS).map((t) => ({
      id: text(t.transaction_id),
      status: text(t.transaction_status),
      amount: money(t.transaction_amount),
      time: text(t.transaction_initiation_date),
    })),
  };
}

const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;

/** The PayPal lookups the model may use. Both only read. */
export function paypalTools(data: AskData, clock: Clock, reader: PayPalReader): AskTool[] {
  const none = (reason: string): ToolResult => ({ facts: { found: false, reason }, lines: [reason], sources: [] });

  return [
    {
      name: "paypal_order",
      description:
        "Reads one order from the PayPal sandbox: its status, amount, captures and refunds. Give the visit id (its order on record is looked up) or a PayPal order id the owner typed.",
      schema: z.object({ visit_id: z.string().max(80).optional(), order_id: z.string().max(40).optional() }),
      run: async (args: { visit_id?: string; order_id?: string }) => {
        let orderId = args.order_id?.trim().toUpperCase();
        if (args.visit_id) {
          const visit = data.visits.find((v) => v.id === args.visit_id);
          if (!visit) return none("No visit with that id in this period.");
          if (!visit.paypalOrderId) return none("The stand has no PayPal order on record for that visit.");
          orderId = visit.paypalOrderId;
        }
        if (!orderId || !ORDER_ID.test(orderId)) return none("That does not look like a PayPal order id.");
        const facts = shapeOrder(await reader.getOrder(orderId));
        const line = facts.found
          ? `PayPal shows order ${String(facts.order_id)} as ${String(facts.status)} for ${String(facts.amount)}.`
          : String(facts.reason);
        return { facts, lines: [line], sources: [SOURCE] };
      },
    },
    {
      name: "paypal_transactions",
      description: "Lists the transactions the PayPal sandbox account shows for the period on screen.",
      schema: z.object({}),
      run: async () => {
        const start = clock.now - Math.min(clock.days, 30) * 86_400_000;
        const facts = shapeTransactions(await reader.listTransactions(iso(start), iso(clock.now)));
        const line = facts.available ? `PayPal lists ${String(facts.count)} transactions for the period.` : String(facts.reason);
        return { facts, lines: [line], sources: [SOURCE] };
      },
    },
  ];
}

type ToolkitTool = { execute?: (args: unknown, options: { toolCallId: string; messages: never[] }) => Promise<unknown> };

let tools: Promise<Record<string, ToolkitTool>> | null = null;

async function toolkitTools(): Promise<Record<string, ToolkitTool>> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: ENABLED_ACTIONS, context: { sandbox: true } },
  });
  return toolkit.getTools() as Record<string, ToolkitTool>;
}

/**
 * Calls one of the toolkit's tools directly. The toolkit builds them for an older version of the
 * model library than this app uses, so the app wraps them in its own tools instead of handing
 * them to the model as they are.
 */
async function call(name: string, args: unknown): Promise<unknown> {
  tools ??= toolkitTools();
  const tool = (await tools)[name];
  if (!tool?.execute) throw new Error(`PayPal toolkit has no ${name}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("PayPal lookup timed out")), TIMEOUT_MS);
  });
  try {
    const out = await Promise.race([tool.execute(args, { toolCallId: name, messages: [] }), late]);
    return typeof out === "string" ? JSON.parse(out) : out;
  } finally {
    clearTimeout(timer);
  }
}

/** The PayPal sandbox, read through the Agent Toolkit with the stand's own credentials. */
export const toolkitReader: PayPalReader = {
  getOrder: (orderId) => call("get_order", { id: orderId }),
  listTransactions: (startIso, endIso) => call("list_transactions", { start_date: startIso, end_date: endIso }),
};
