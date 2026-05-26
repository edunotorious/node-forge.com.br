// Anvil silhouette used inside the NODE [anvil] FORGE wordmark.
// Stylized — recognizable horn + face + waist + foot — not a literal blacksmith
// anvil. Stroke-less; fill follows `currentColor` so the parent decides hue.
export function AnvilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="currentColor"
      role="img"
      aria-label="anvil"
      className={className}
    >
      {/* Horn (tapered left extension) + face (flat top working surface) */}
      <path d="M2 14 Q 10 10, 22 12 L 56 12 L 58 8 L 60 8 L 60 18 L 22 18 Q 10 18, 2 16 Z" />
      {/* Waist (narrower body) */}
      <path d="M18 18 L 50 18 L 46 26 L 22 26 Z" />
      {/* Base / foot */}
      <path d="M12 26 L 56 26 L 60 36 L 8 36 Z" />
    </svg>
  );
}
