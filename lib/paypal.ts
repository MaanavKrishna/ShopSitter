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

/**
 * The PayPal order for a hold: intent AUTHORIZE, one amount, no items. `ref` stands for the visit
 * without being its id, because a checked-in visit's id is the shopper's credential.
 */
export function buildHoldOrderBody(cents: number, ref: string) {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("a hold needs a whole, positive amount");
  return {
    intent: CheckoutPaymentIntent.Authorize,
    purchaseUnits: [{ referenceId: ref, invoiceId: `${ref}-hold-${cents}`, amount: money(cents) }],
  } satisfies OrderRequest;
}

export type OrderBody = ReturnType<typeof buildOrderBody> | ReturnType<typeof buildHoldOrderBody>;

/** PayPal answered and said no (a 4xx answer): nothing was sent or changed on its side. */
export class PayPalRefused extends Error {
  constructor(what: string) {
    super(`PayPal refused the ${what}`);
  }
}

/** True for an error that carries a 4xx answer from PayPal, as opposed to a timeout or a fault on its side. */
export function refusalFrom(e: unknown): boolean {
  const status = (e as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

export interface PayPalGateway {
  createOrder(body: OrderBody): Promise<{ orderId: string }>;
  captureOrder(orderId: string): Promise<{ captureId: string; amountCents: number; status: string }>;
  /**
   * `key` identifies this refund: the same key retried returns the same refund instead of a second one.
   * Throws PayPalRefused when PayPal turns the refund down.
   */
  refundCapture(captureId: string, cents: number, key: string): Promise<{ refundId: string }>;
}

/** The gateway with the calls a hold needs: set money aside, take some of it, let it go. */
export interface HoldGateway extends PayPalGateway {
  /** Turns an order the shopper approved (intent AUTHORIZE) into money set aside. Throws PayPalRefused when PayPal says no. */
  authorizeOrder(orderId: string): Promise<{ authorizationId: string; amountCents: number }>;
  /**
   * Takes `cents` of an authorization and, with `final`, releases whatever is left of it.
   * `key` identifies this capture: the same key retried returns the same capture.
   */
  captureAuthorization(
    authorizationId: string,
    cents: number,
    key: string,
    final: boolean,
  ): Promise<{ captureId: string; amountCents: number }>;
  /** Releases an authorization without taking anything. */
  voidAuthorization(authorizationId: string): Promise<void>;
}

const refused = (what: string) => (e: unknown): never => {
  if (refusalFrom(e)) throw new PayPalRefused(what);
  throw e;
};

class SandboxGateway implements HoldGateway {
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

  async authorizeOrder(orderId: string) {
    const { result } = await this.orders
      .authorizeOrder({ id: orderId, paypalRequestId: `authorize-${orderId}`, prefer: "return=representation" })
      .catch(refused("hold"));
    const auth = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
    if (!auth?.id || !auth.amount?.value) throw new Error("PayPal returned no authorization");
    return { authorizationId: auth.id, amountCents: Math.round(Number(auth.amount.value) * 100) };
  }

  async captureAuthorization(authorizationId: string, cents: number, key: string, final: boolean) {
    const { result } = await this.payments
      .captureAuthorizedPayment({
        authorizationId,
        paypalRequestId: key,
        prefer: "return=representation",
        body: { amount: money(cents), finalCapture: final },
      })
      .catch(refused("capture"));
    if (!result.id) throw new Error("PayPal returned no capture");
    // The amount is read back when PayPal sends it; a capture it accepted is otherwise for the amount asked.
    const value = result.amount?.value;
    return { captureId: result.id, amountCents: value ? Math.round(Number(value) * 100) : cents };
  }

  async voidAuthorization(authorizationId: string) {
    await this.payments
      .voidPayment({ authorizationId, paypalRequestId: `void-${authorizationId}` })
      .catch(refused("release"));
  }

  async refundCapture(captureId: string, cents: number, key: string) {
    const { result } = await this.payments
      .refundCapturedPayment({ captureId, paypalRequestId: key, body: { amount: money(cents) } })
      .catch((e: unknown) => {
        if (refusalFrom(e)) throw new PayPalRefused("refund");
        throw e;
      });
    if (!result.id) throw new Error("PayPal returned no refund id");
    return { refundId: result.id };
  }
}

let gateway: HoldGateway | null = null;

/** The PayPal sandbox, configured from env vars. */
export function getGateway(): HoldGateway {
  gateway ??= new SandboxGateway();
  return gateway;
}
