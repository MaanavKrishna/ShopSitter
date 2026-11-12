import { PayPalRefused, type HoldGateway } from "@/lib/paypal";

/** A PayPal that remembers what it was asked, with switches to make each call fail. */
export class FakeHoldPayPal implements HoldGateway {
  orders: { id: string; cents: number; intent: string; ref: string }[] = [];
  authorized: { id: string; orderId: string; cents: number }[] = [];
  captures: { authorizationId: string; cents: number; key: string; final: boolean }[] = [];
  voids: string[] = [];
  fail: { create?: boolean; authorize?: "refuse" | "down"; capture?: boolean; void?: boolean } = {};
  /** When set, PayPal authorizes this amount instead of the order's. */
  authorizeCents: number | null = null;

  async createOrder(body: { intent: string; purchaseUnits: { referenceId: string; amount: { value: string } }[] }) {
    if (this.fail.create) throw new Error("PayPal is down");
    const id = `ORDER${this.orders.length + 1}`;
    const unit = body.purchaseUnits[0];
    this.orders.push({ id, cents: Math.round(Number(unit.amount.value) * 100), intent: body.intent, ref: unit.referenceId });
    return { orderId: id };
  }
  async captureOrder(orderId: string) {
    return { captureId: `CAP-${orderId}`, amountCents: this.orders.find((o) => o.id === orderId)!.cents, status: "COMPLETED" };
  }
  async refundCapture() {
    return { refundId: "REF1" };
  }
  async authorizeOrder(orderId: string) {
    if (this.fail.authorize === "refuse") throw new PayPalRefused("hold");
    if (this.fail.authorize === "down") throw new Error("PayPal is down");
    const order = this.orders.find((o) => o.id === orderId)!;
    const auth = { id: `AUTH-${orderId}`, orderId, cents: this.authorizeCents ?? order.cents };
    this.authorized.push(auth);
    return { authorizationId: auth.id, amountCents: auth.cents };
  }
  async captureAuthorization(authorizationId: string, cents: number, key: string, final: boolean) {
    if (this.fail.capture) throw new Error("PayPal is down");
    const auth = this.authorized.find((a) => a.id === authorizationId)!;
    if (cents > auth.cents) throw new PayPalRefused("capture");
    this.captures.push({ authorizationId, cents, key, final });
    return { captureId: `CAP-${authorizationId}`, amountCents: cents };
  }
  async voidAuthorization(authorizationId: string) {
    if (this.fail.void) throw new Error("PayPal is down");
    this.voids.push(authorizationId);
  }
}
