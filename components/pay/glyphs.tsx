import type { SVGProps } from "react";

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function MinusGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M5 10h10" />
    </svg>
  );
}

export function PlusGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M5 10h10M10 5v10" />
    </svg>
  );
}

export function CheckGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M4.5 10.5l3.6 3.6 7.4-8" />
    </svg>
  );
}

export function CloseGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

/** Eye: "have a look at this". */
export function LookGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M1.8 10S4.8 4.6 10 4.6 18.2 10 18.2 10 15.2 15.4 10 15.4 1.8 10 1.8 10z" />
      <circle cx="10" cy="10" r="2.3" />
    </svg>
  );
}

export function ClockGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6v4.3l2.7 1.7" />
    </svg>
  );
}

export function InfoGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 9.3v4.2M10 6.5v.1" />
    </svg>
  );
}

export function ListGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5h8M4 10h12M4 14.5h6M15.5 3.5v4M13.5 5.5h4" />
    </svg>
  );
}

export function AlertGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3.2l7.3 12.6H2.7L10 3.2z" />
      <path d="M10 8.3v3.4M10 13.9v.1" />
    </svg>
  );
}

export function SearchGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="9" r="5.2" />
      <path d="M13 13l3.8 3.8" />
    </svg>
  );
}
