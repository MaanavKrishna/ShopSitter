import { describe, expect, it } from "vitest";
import { priceLines } from "@/lib/money";
import { buildOrderBody } from "@/lib/paypal";
import { DEMO_PRODUCTS } from "@/lib/seed";

describe("buildOrderBody", () => {
  const bill = priceLines([{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], DEMO_PRODUCTS);
  const body = buildOrderBody(bill, "v1");
  const unit = body.purchaseUnits[0];

  it("asks PayPal to capture the bill total in USD", () => {
    expect(body.intent).toBe("CAPTURE");
    expect(unit.amount.currencyCode).toBe("USD");
    expect(unit.amount.value).toBe("19.00");
  });

  it("sends a breakdown and items that add up exactly to the total", () => {
    expect(unit.amount.breakdown.itemTotal.value).toBe("19.00");
    const sum = unit.items.reduce((s, i) => s + Math.round(Number(i.unitAmount.value) * 100) * Number(i.quantity), 0);
    expect(sum).toBe(1900);
    expect(unit.items[0].unitAmount.value).toBe("7.00");
    expect(unit.items[0].quantity).toBe("2");
    expect(unit.items[0].name).toBe("Honey");
  });

  it("ties the order to the visit and its total", () => {
    expect(unit.referenceId).toBe("v1");
    expect(unit.invoiceId).toBe("v1-1900");
  });
});
