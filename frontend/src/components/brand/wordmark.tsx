import { cn } from "@/lib/utils";

import { AnvilIcon } from "./anvil-logo";

// NODE [anvil] FORGE wordmark. Inherits color from parent for the text; the
// anvil itself is always brand-orange. Use `size` to scale uniformly.
export function Wordmark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const text = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-6xl",
  }[size];
  const anvil = {
    sm: "h-3 w-5",
    md: "h-4 w-7",
    lg: "h-6 w-10",
    xl: "h-12 w-20",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-heading font-black tracking-tight whitespace-nowrap",
        text,
        className,
      )}
    >
      <span>NODE</span>
      <AnvilIcon className={cn("text-primary", anvil)} />
      <span>FORGE</span>
    </span>
  );
}
