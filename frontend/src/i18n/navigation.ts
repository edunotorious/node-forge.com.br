import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

// Locale-aware replacements for `next/link` and `next/navigation` helpers.
// Prefer these in components so that locale prefixes are preserved/stripped
// automatically per the routing config.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
