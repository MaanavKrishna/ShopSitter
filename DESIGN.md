# Shopsitter design system

One identity, "Studio Void": the stand's products float in a saturated cobalt studio, lit like a product launch.
Cobalt owns the moments that sell and the moments that matter (the bill, the payment); white owns the screens where
people work.

## Where things live

| Layer | File |
| --- | --- |
| Colour tokens | `app/globals.css` (`:root`) |
| Space, type, shape, depth, materials, timing, stacking | `app/system.css` |
| Component theme (design-system controls) | `themes/void/voidTheme.ts`, built to `themes/void/void.css` |
| Springs and reveal presets | `lib/motion.ts` |
| Cascade order | `app/layers.css` |
| Motion set pieces | `components/landing/`, `components/inner/`, `components/stand/`, `components/pay/`, `components/basket/` |

## Colour

| Role | Value | Meaning |
| --- | --- | --- |
| Cobalt | `#0a35c8` (deep `#0024a6`, lit `#2152f2`) | Brand, primary action, paid |
| Ink | `#0a1024` (soft `#4b5570`) | Text |
| Surfaces | white, tint `#f1f4ff`, fill `#e2e8ff`, hairline `#d9e0f5` | Working screens |
| Coral | `#ff6b4a` (text `#b02f17`, tint `#ffe2da`) | Unmatched, needs a look, the key action on cobalt |
| PayPal yellow | `#ffc439` (text `#5a4300`, tint `#fff0c2`) | PayPal itself, adjusted bills, caution |
| Night | `#060b1f` to `#0a1024` | The one dark chapter a page may have |

There is no green: good news is cobalt. Neutrals are tinted from the ink, never plain grey.

## Type

Inter for reading, Inter Tight (600 to 800) for headlines and every figure of money. Display text is large with
tracking between -0.02em and -0.04em; body tracking is 0. Money uses tabular figures. Scale: `--t-xs` to `--t-h1`,
with `--t-figure` for hero amounts.

## Space, shape, depth

4px base scale (`--s-1` to `--s-10`). Radii from 6px to 24px (`--r-xs` to `--r-xl`); controls 12px, panels 16px,
sheets 24px. Three elevations (`--e-1` to `--e-3`), each with an offset and a soft blur, plus `--e-blue` for objects
floating in the studio. Hairlines are 1px (`--hairline`, `--hairline-on-blue`).

## Materials

Floating chrome (navigation, docks, pay bar, tab bar) is translucent: `--material-light` or `--material-blue` with
`--material-filter` and a bright top edge. Content scrolls underneath. With reduced transparency they become solid.

## Motion

- Springs for anything that moves or resizes, critically damped by default (`spring` in `lib/motion.ts`).
- A little bounce only as the answer to the person's own action (a confirmed payment).
- Feedback on pointer-down: pressed controls scale to 0.97 within 100ms.
- State changes are interruptible; things leave the way they came.
- One set piece per screen; everything else is quiet.
- Reduced motion replaces movement with a cross-fade.

## Structure

| Area | Routes | Shell |
| --- | --- | --- |
| Public pages | `/`, `/how-it-works`, `/owners`, `/trust`, `/demo` | Floating translucent navigation, full-viewport chapters, shared footer |
| Store simulator | `/demo/store` | Cobalt page: shelf cameras, the shopper's phone and the owner's ledger side by side |
| Stand | `/stand` | Full-bleed stage on cobalt with a floating status dock |
| Extra cameras | `/stand/camera/[n]` (n = 2 to 4) | The same stage, camera only, for a second view of a shelf |
| Pay | `/pay/[visitId]` | Bill sheet over a cobalt header, pay bar pinned to the bottom |
| Basket | `/enter`, `/basket/[sessionId]` | The same sheet as a live basket: hold step, claim cards, Done |
| Owner | `/owner/login`, `/owner/...` | App shell: sidebar on desktop, tab bar on phone; Overview, Store, Visits, Shelf, Products, Sales, Setup |

## Words

Sentence case and plain words. A visit with no payment is "unmatched"; the product never accuses anyone. The camera
counts items, not people.
