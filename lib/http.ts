import { CheckoutError, type CheckoutErrorCode } from "./checkout";

const STATUS: Record<CheckoutErrorCode, number> = {
  not_found: 404,
  not_editable: 409,
  empty_bill: 409,
  already_paid: 409,
  too_late: 409,
  amount_mismatch: 409,
};

/** Runs a route handler body and turns known checkout errors into JSON responses. */
export async function respond<T>(work: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await work());
  } catch (e) {
    if (e instanceof CheckoutError) return Response.json({ error: e.code }, { status: STATUS[e.code] });
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
