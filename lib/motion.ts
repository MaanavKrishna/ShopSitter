// One motion vocabulary for the whole app, so every screen moves the same way.
// Springs are critically damped by default: they settle without overshoot and can be
// interrupted at any point. Bounce is kept for moments that follow a physical action.

/** Default spring for anything that moves or resizes. */
export const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;
/** Quicker spring for small controls: steppers, chips, toggles. */
export const springSnappy = { type: "spring", bounce: 0, duration: 0.3 } as const;
/** A little bounce, for a confirmation that follows the person's own action. */
export const springBouncy = { type: "spring", bounce: 0.22, duration: 0.5 } as const;
/** Ease-out for opacity and colour, where a spring adds nothing. */
export const easeOut = [0.16, 1, 0.3, 1] as const;
/** Delay between siblings that enter one after another. */
export const STAGGER = 0.06;

/** Fade and rise into place. Use with `initial="hidden"` and `animate` or `whileInView="shown"`. */
export const rise = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: spring },
} as const;

/** A parent that reveals its children one after another. */
export const stagger = {
  hidden: {},
  shown: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
} as const;
