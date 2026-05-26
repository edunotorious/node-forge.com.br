import { cn } from "@/lib/utils";
import { detectVisibility, type Visibility } from "@/lib/graph-types";

// Small glyph next to each variable/function name conveying Python-style
// visibility — derived purely from the name (no separate field):
//
//   public     → filled circle
//   protected  → outline circle
//   private    → small filled circle inside a ring
//   constant   → filled square (ALL_CAPS names)
//
// Color is independent of visibility — type drives color (see TYPE_COLORS).
export function VisibilityGlyph({
  name,
  colorClass,
}: {
  name: string;
  colorClass: string;
}) {
  const v = detectVisibility(name);
  return <Glyph visibility={v} colorClass={colorClass} />;
}

function Glyph({
  visibility,
  colorClass,
}: {
  visibility: Visibility;
  colorClass: string;
}) {
  if (visibility === "constant") {
    return <span className={cn("inline-block h-2.5 w-2.5", colorClass)} />;
  }
  if (visibility === "public") {
    return (
      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", colorClass)} />
    );
  }
  if (visibility === "protected") {
    return (
      <span
        className={cn(
          "inline-block h-2.5 w-2.5 rounded-full border-2 bg-transparent",
          colorClass.replace("bg-", "border-"),
        )}
      />
    );
  }
  // private — filled center inside a ring
  return (
    <span
      className={cn(
        "relative inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border-2",
        colorClass.replace("bg-", "border-"),
      )}
    >
      <span className={cn("h-1 w-1 rounded-full", colorClass)} />
    </span>
  );
}
