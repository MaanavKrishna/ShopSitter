import { cookieShop } from "@/lib/owner-http";
import { isTrial } from "@/lib/shops";

/**
 * Where a browser with no usable sign-in goes. One that still carries the cookie of a trial
 * stand that has run out is told so on the demo page; everyone else is asked for a passcode.
 */
export async function signedOutPath(): Promise<string> {
  const shop = await cookieShop().catch(() => null);
  return shop && isTrial(shop) ? "/demo?ended=1" : "/owner/login";
}
