import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/price";

// Listings have no screenshot, so each one gets a generated cover: a
// gradient picked from its slug plus a stylised circuit drawn from its
// real shape (qubit wires, node count). Deterministic, so a listing
// looks the same on every visit and in every list.
const GRADIENTS = [
  "from-[#0C1532] via-[#1d2b5c] to-[#F08230]",
  "from-[#0C1532] via-[#123f4f] to-[#2bb3a3]",
  "from-[#1b1036] via-[#3b1f6b] to-[#c36cf0]",
  "from-[#0C1532] via-[#26335f] to-[#5b8def]",
  "from-[#2a1208] via-[#7a3412] to-[#F08230]",
  "from-[#08201a] via-[#0f4a3a] to-[#7bd389]",
];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface CoverProps {
  slug: string;
  numQubits: number;
  nodeCount: number;
  className?: string;
  children?: React.ReactNode;
}

export function ListingCover({
  slug,
  numQubits,
  nodeCount,
  className,
  children,
}: CoverProps) {
  const seed = hashString(slug);
  const wires = Math.min(Math.max(numQubits || 2, 1), 5);
  const gates = Math.min(Math.max(nodeCount, 2), 9);
  const top = 18;
  const gap = wires > 1 ? 54 / (wires - 1) : 0;
  const wireY = (w: number) => (wires > 1 ? top + w * gap : 45);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-gradient-to-br",
        GRADIENTS[seed % GRADIENTS.length],
        className,
      )}
    >
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full opacity-80"
        aria-hidden
      >
        {Array.from({ length: wires }).map((_, w) => (
          <line
            key={w}
            x1="10"
            x2="150"
            y1={wireY(w)}
            y2={wireY(w)}
            stroke="white"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: gates }).map((_, i) => {
          const x = 22 + i * (116 / Math.max(gates - 1, 1));
          const bits = (seed >>> (i * 3)) & 7;
          const w = bits % wires;
          // Roughly one in four columns becomes a two-wire gate.
          if (wires > 1 && bits >= 6) {
            const target = (w + 1) % wires;
            return (
              <g key={i}>
                <line
                  x1={x}
                  x2={x}
                  y1={wireY(w)}
                  y2={wireY(target)}
                  stroke="white"
                  strokeOpacity="0.8"
                  strokeWidth="1.2"
                />
                <circle cx={x} cy={wireY(w)} r="2.6" fill="white" />
                <circle
                  cx={x}
                  cy={wireY(target)}
                  r="4.2"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.2"
                />
              </g>
            );
          }
          return (
            <rect
              key={i}
              x={x - 5}
              y={wireY(w) - 5}
              width="10"
              height="10"
              rx="2.5"
              fill="white"
              fillOpacity={bits % 2 ? 0.9 : 0.55}
            />
          );
        })}
      </svg>
      {children}
    </div>
  );
}

export function PriceBadge({
  priceCents,
  currency,
  className,
}: {
  priceCents: number;
  currency: string;
  className?: string;
}) {
  const t = useTranslations("vault.price");
  const locale = useLocale();
  const free = priceCents === 0;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-bold shadow-sm",
        free
          ? "bg-emerald-500 text-white"
          : "bg-white text-[#0C1532]",
        className,
      )}
    >
      {free ? t("free") : formatPrice(priceCents, currency, locale)}
    </span>
  );
}

export function AuthorAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
      {initial}
    </span>
  );
}

export function PriceModeToggle({
  paid,
  onChange,
}: {
  paid: boolean;
  onChange: (paid: boolean) => void;
}) {
  const t = useTranslations("vault.price");
  return (
    <div role="radiogroup" className="flex rounded-full bg-card p-1 ring-1 ring-border">
      {[false, true].map((value) => (
        <button
          key={String(value)}
          type="button"
          role="radio"
          aria-checked={paid === value}
          onClick={() => onChange(value)}
          className={
            "flex-1 rounded-full px-3 py-1 text-sm font-medium transition-colors " +
            (paid === value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {value ? t("paid") : t("free")}
        </button>
      ))}
    </div>
  );
}

// A missing author means the account was deleted; an author without a
// display name or username is just someone who never filled them in.
export function authorLabel(
  author: { display_name: string | null; username: string | null } | null,
  t: (key: "deletedAuthor" | "anonymousAuthor") => string,
): string {
  if (!author) return t("deletedAuthor");
  return author.display_name ?? author.username ?? t("anonymousAuthor");
}
