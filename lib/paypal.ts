import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  ItemCategory,
  OrdersController,
  PaymentsController,
  type OrderRequest,
} from "@paypal/paypal-server-sdk";
import { formatCents } from "./money";
import type { PricedBill } from "./types";

const CURRENCY = "USD";
const money = (cents: number) => ({ currencyCode: CURRENCY, value: formatCents(cents) });

/**
 * The PayPal order for a bill. Item prices and the breakdown come straight from the
 * priced bill, so they always add up to the amount (PayPal rejects orders that don't).
 */
export function buildOrderBody(bill: PricedBill, visitId: string) {
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        referenceId: visitId,
        // Changes whenever the total changes, so a stale order can never be reused for a new bill.
        invoiceId: `${visitId}-${bill.totalCents}`,
        amount: { ...money(bill.totalCents), breakdown: { itemTotal: money(bill.totalCents) } },
        items: bill.lines.map((l) => ({
          name: l.name,
          sku: l.sku,
          quantity: String(l.qty),
          unitAmount: money(l.unitCents),
          category: ItemCategory.PhysicalGoods,
        })),
      },
    ],
  } satisfies OrderRequest;
}

export type OrderBody = ReturnType<typeof buildOrderBody>;

export interface PayPalGateway {
  createOrder(body: OrderBody): Promise<{ orderId: string }>;
  captureOrder(orderId: string): Promise<{ captureId: string; amountCents: number; status: string }>;
  refundCapture(captureId: string, cents: number): Promise<{ refundId: string }>;
}

class SandboxGateway implements PayPalGateway {
  private orders: OrdersController;
  private payments: PaymentsController;

  constructor() {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
    const client = new Client({
      clientCredentialsAuthCredentials: { oAuthClientId: id, oAuthClientSecret: secret },
      environment: Environment.Sandbox,
      // The SDK default is no timeout at all; a hung call would freeze the pay page.
      timeout: 15_000,
    });
    this.orders = new OrdersController(client);
    this.payments = new PaymentsController(client);
  }

  async createOrder(body: OrderBody) {
    const { result } = await this.orders.createOrder({
      body,
      // Same bill, same key: a retried request returns the same order instead of a second one.
      paypalRequestId: `order-${body.purchaseUnits[0].invoiceId}`,
    });
    if (!result.id) throw new Error("PayPal returned no order id");
    return { orderId: result.id };
  }

  async captureOrder(orderId: string) {
    const { result } = await this.orders.captureOrder({ id: orderId, paypalRequestId: `capture-${orderId}` });
    const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
    if (!capture?.id || !capture.amount?.value) throw new Error("PayPal returned no capture");
    return {
      captureId: capture.id,
      amountCents: Math.round(Number(capture.amount.value) * 100),
      status: capture.status ?? "UNKNOWN",
    };
  }

  async refundCapture(captureId: string, cents: number) {
    const { result } = await this.payments.refundCapturedPayment({
      captureId,
      paypalRequestId: `refund-${captureId}-${cents}`,
      body: { amount: money(cents) },
    });
    if (!result.id) throw new Error("PayPal returned no refund id");
    return { refundId: result.id };
  }
}

let gateway: PayPalGateway | null = null;

/** The PayPal sandbox, configured from env vars. */
export function getGateway(): PayPalGateway {
  gateway ??= new SandboxGateway();
  return gateway;
}
