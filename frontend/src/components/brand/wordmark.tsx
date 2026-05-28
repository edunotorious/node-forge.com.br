import { cn } from "@/lib/utils";

import { Logo } from "./logo";

// Sized wrapper around the official Logo SVG. Existing callers
// (TopBar, Login/Register/Forgot/Reset pages) keep their `size` API
// unchanged. The Logo's intrinsic aspect ratio (~7.4:1) means we only
// need to set a height — width follows automatically.
export function Wordmark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const height = {
    sm: "h-4",
    md: "h-6",
    lg: "h-9",
    xl: "h-14",
  }[size];

  return <Logo className={cn(height, className)} />;
}
