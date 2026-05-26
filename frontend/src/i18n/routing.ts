import { defineRouting } from "next-intl/routing";

// `as-needed` keeps pt-BR (default) at root URLs (e.g. `/projects`) and prefixes
// other locales (e.g. `/en/projects`). Brazil is the primary market — switching
// to English is opt-in via the locale switcher (which adds /en to the path).
export const routing = defineRouting({
  locales: ["pt-BR", "en"] as const,
  defaultLocale: "pt-BR",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
