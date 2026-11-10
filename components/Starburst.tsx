/** The greengrocer's "flash": a spiky card that holds the number that matters. Purely decorative shape. */
export function Starburst({ points = 20, depth = 0.86, className }: { points?: number; depth?: number; className?: string }) {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? 50 : 50 * depth;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polygon points={coords.join(" ")} fill="currentColor" />
    </svg>
  );
}
