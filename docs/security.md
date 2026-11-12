# Security and trust model

Shopsitter takes money and stores shelf photos, so this page says who can do what, what each secret is, and what
is deliberately out of scope for a prototype.

## Who is who

| Actor | Proves it with | Can do |
| --- | --- | --- |
| Shopper | Nothing, or a session id from the door QR | See and correct their own bill, pay it |
| Stand device (camera) | The stand's 6-digit code, or a signed stand key for a trial stand | Send shelf photos for its own store and shelf |
| Owner | Passcode, kept as a signed, http-only session cookie | Everything for their own store |
| Trial visitor | A signed cookie for a private trial store that lasts a day | Everything an owner can, inside that trial only |
| Anyone | Nothing | Read public pages, run the sample demo (rate limited) |

## Secrets and tokens

| Secret | Form | Where it travels | Notes |
| --- | --- | --- | --- |
| Owner cookie | HMAC-signed store id | Cookie: http-only, same-site lax, secure in production | Passcode comparison is timing-safe; sign-in is rate limited before comparing |
| Stand code | 6 digits (real store) | `x-stand-token` header | Limited before the comparison: 5 wrong tries per caller per 10 minutes, plus a cap across all callers |
| Stand key | HMAC-signed store id and expiry (trial stores) | URL fragment, then `x-stand-token` | A fragment never reaches server logs; a tampered or expired key is refused |
| Door token | HMAC-signed store id and door number, with its own purpose tag | URL fragment of the door QR | Cannot be used as a stand key, and a stand key cannot be used as a door token. The owner can issue a new door QR, which stops the old one working |
| Session id | 100 random bits | URL path of the shopper's basket | The only thing a shopper holds. It opens one basket, and shows shelf changes in that shop that nobody has claimed since they checked in, so they can claim their own |
| PayPal credentials, model key, signing secret | Environment variables | Server only | Never sent to a browser, never logged, never committed |

Each kind of token is accepted only where it belongs. None of them can be exchanged for another.

## Money

- Every price and total is computed on the server from the owner's catalogue, in whole cents. Browsers send
  product ids and quantities only. The vision model returns ids and counts and is never asked for a price.
- Model output is sanitised before billing: only catalogue products for that shelf, whole numbers, bounded
  quantities. The catalogue is passed to the model as data, and it is told not to follow instructions inside it.
- Every PayPal write carries an idempotency key, so a retried request cannot charge twice. Calls have explicit
  timeouts. Two refunds started at the same instant for the same payment are not guarded against each other.
- A payment is captured only for the order the server created for that bill, and only if the amount still matches.
  A visit that is no longer payable is refused before PayPal is called.
- With a hold: the server authorises the amount it computed, decides the capture amount once and saves it before
  asking PayPal, captures no more than was authorised, and releases the rest. A hold is also released when the
  owner settles the visit another way and when a trial store ends. Each authorise, capture, void and refund is
  written to the visit's money trail.
- While a basket is open or money is held on it, the ordinary pay-page routes refuse that visit, so a shopper
  cannot be charged twice or skip the hold.
- A shopper cannot make a visit disappear: if the camera saw items and the shopper removes every line, the visit
  stays in the owner's figures as unmatched, marked as adjusted.
- If PayPal moved money and the record could not be saved, the capture reference is still stored and the shopper is
  told to check PayPal rather than "nothing was charged".
- The owner's "ask" box cannot invent money: an answer containing an amount that is not in the records is rejected.

## Separation between stores

Every stored row and photo belongs to one store. The store is taken from the verified cookie, code, key or token,
never from a field the client sends. Tests on both storage back ends check that one store cannot read another's
products, visits or photos, including trial stores against the real one.

One thing is shared: every store in this deployment uses the same PayPal sandbox merchant account. The question
box therefore gives PayPal lookups carefully: trial stores get none, the demo store may look up only its own
orders, and only the real store may list the account's transactions (which include demo and trial payments).

## Privacy

- The camera is pointed at a shelf. What is stored: the before and after shelf photos of a change, visible only to
  the signed-in owner of that store.
- The hand and person detector runs in the stand's browser. Nothing it sees is stored or sent; only a daily count
  of visitors is kept.
- Nobody is identified. A visit with no payment is "unmatched", and the product never accuses anyone.
- The public bill link shows what the shopper needs: lines, total, payment state, the PayPal capture reference for
  their receipt, and how sure the camera was. It does not show photos, order ids or stock.

## Abuse and cost limits

Sign-in, stand codes, demo reads, trial creation, shelf reads per trial, session creation, bill edits, PayPal order
creation and the ask box are all rate limited. The demo and trial stores also have caps across all callers on
paid model reads; the real store's cameras are limited by its stand code only. Callers are told apart by the
hosting platform's own address header, not one the caller can set. Product photos are checked by their bytes;
shelf photos from cameras are size limited. Cookie-authenticated writes must be JSON, so a form on another site
cannot make them. Every response carries headers against framing and content sniffing, and private answers are
never cached.

## Known limits of this prototype

- Rate limits are counted in memory on each server instance, so real ceilings on serverless hosting are higher
  than the configured numbers and reset on a cold start.
- One passcode per store, shared by everyone who runs it. There are no user accounts or roles.
- Nothing runs on a schedule. A trial store is deleted the next time it is touched after its day is up, and the
  demo store resets itself at most hourly when someone opens it. The real store's data is kept until deleted by hand.
- The real store's door QR has no expiry; issuing a new one is how it is cancelled. Someone holding a valid door
  code can check in from anywhere.
- Shelf photos are sent to the vision model's provider to be read.
- A shelf photo can include part of a person who was at the shelf.
- PayPal runs in sandbox mode only.
