import { describe, expect, it } from "vitest";
import {
  centsFromDollars,
  checkProductForm,
  imageKind,
  refPhotoProblem,
  isOwnRefPhoto,
  refPhotoKey,
  suggestSku,
} from "@/lib/products";

describe("centsFromDollars", () => {
  it("turns dollars into whole cents without floating point drift", () => {
    expect(centsFromDollars("7.10")).toBe(710);
    expect(centsFromDollars("0.07")).toBe(7);
    expect(centsFromDollars("19.99")).toBe(1999);
    expect(centsFromDollars("1.1")).toBe(110);
    expect(centsFromDollars("4.35")).toBe(435);
    expect(centsFromDollars("12")).toBe(1200);
    expect(centsFromDollars("0")).toBe(0);
  });

  it("accepts spaces around the amount, a leading dollar sign and a bare decimal point", () => {
    expect(centsFromDollars("  7.5 ")).toBe(750);
    expect(centsFromDollars("$3.20")).toBe(320);
    expect(centsFromDollars(".5")).toBe(50);
  });

  it("rejects negatives, more than two decimals and anything that is not a number", () => {
    for (const bad of ["-1", "-0.50", "1.234", "7.100", "abc", "", " ", "1,50", "1e2", "1.", ".", "$", "1 2", "NaN", "Infinity", "0x10", "+5"]) {
      expect(centsFromDollars(bad), bad).toBeNull();
    }
  });

  it("rejects amounts too long to be a price", () => {
    expect(centsFromDollars("12345678")).toBeNull();
  });
});

describe("suggestSku", () => {
  it("makes a short lowercase id from the name", () => {
    expect(suggestSku("Wildflower Honey", [])).toBe("wildflower-honey");
    expect(suggestSku("  Mum's   Jam (large)! ", [])).toBe("mums-jam-large");
    expect(suggestSku("Crème brûlée", [])).toBe("creme-brulee");
  });

  it("keeps to 32 characters and never ends on a dash", () => {
    const sku = suggestSku("A very long product name that goes on and on", []);
    expect(sku.length).toBeLessThanOrEqual(32);
    expect(sku).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("adds a number when the id is taken", () => {
    expect(suggestSku("Honey", ["honey"])).toBe("honey-2");
    expect(suggestSku("Honey", ["honey", "honey-2"])).toBe("honey-3");
  });

  it("is empty when the name has nothing usable in it", () => {
    expect(suggestSku("", [])).toBe("");
    expect(suggestSku("!!!", [])).toBe("");
  });
});

describe("checkProductForm", () => {
  const good = { sku: "honey", name: " Honey ", description: " Glass jar, gold lid ", price: "7.10", stock: "6" };

  it("returns the product fields, trimmed, with the price in cents", () => {
    expect(checkProductForm(good)).toEqual({
      ok: true,
      value: { sku: "honey", name: "Honey", description: "Glass jar, gold lid", priceCents: 710, stock: 6 },
    });
  });

  it("says what is wrong with each field", () => {
    const result = checkProductForm({ sku: "Honey Jar", name: "  ", description: "x".repeat(201), price: "7.123", stock: "1.5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["description", "name", "price", "sku", "stock"]);
  });

  it("holds the price and the stock to the catalogue's limits", () => {
    const high = checkProductForm({ ...good, price: "1000.01", stock: "1000" });
    expect(high.ok).toBe(false);
    if (high.ok) return;
    expect(Object.keys(high.errors).sort()).toEqual(["price", "stock"]);
    expect(checkProductForm({ ...good, price: "1000", stock: "999" }).ok).toBe(true);
    expect(checkProductForm({ ...good, price: "0", stock: "0" }).ok).toBe(true);
  });

  it("rejects a stock that is negative, empty or not a whole number", () => {
    for (const stock of ["-1", "", "six", "1e2", "2.0"]) {
      const result = checkProductForm({ ...good, stock });
      expect(result.ok, stock).toBe(false);
    }
  });
});

describe("imageKind", () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);

  it("recognises JPEG, PNG and WebP from their first bytes", () => {
    expect(imageKind(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(imageKind(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0]);
    expect(imageKind(webp)).toBe("webp");
  });

  it("rejects everything else, whatever the file is called", () => {
    expect(imageKind(pad([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    expect(imageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageKind(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(imageKind(new Uint8Array())).toBeNull();
  });
});

describe("refPhotoProblem", () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);

  it("accepts a JPEG, the only kind the rest of the app serves and shows to the vision model", () => {
    expect(refPhotoProblem(pad([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });

  it("turns away PNG and WebP with their own code", () => {
    expect(refPhotoProblem(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("not_jpeg");
    expect(refPhotoProblem(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0]))).toBe("not_jpeg");
  });

  it("turns away anything that is not a picture, whatever it is called", () => {
    expect(refPhotoProblem(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBe("bad_photo");
    expect(refPhotoProblem(new Uint8Array())).toBe("bad_photo");
  });
});

describe("reference photo keys", () => {
  it("start with the shop, so the owner photo route only serves them to that shop", () => {
    expect(refPhotoKey("live", "honey", 1700000000000)).toBe("live-ref-honey-1700000000000.jpg");
    expect(refPhotoKey("demo", "jam", 5)).toMatch(/^demo-/);
  });

  it("knows which stored photos belong to a shop's products", () => {
    expect(isOwnRefPhoto("live", "live-ref-honey.jpg")).toBe(true);
    expect(isOwnRefPhoto("live", "live-ref-honey-1700000000000.jpg")).toBe(true);
    expect(isOwnRefPhoto("live", "demo-ref-honey.jpg")).toBe(false);
    expect(isOwnRefPhoto("live", "live-1700000000000-before.jpg")).toBe(false);
    expect(isOwnRefPhoto("demo", "/samples/honey.jpg")).toBe(false);
    expect(isOwnRefPhoto("live", null)).toBe(false);
  });
});
