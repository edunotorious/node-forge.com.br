import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

// Next 16 renamed `middleware` to `proxy`. Same hook, clearer name.
//
// This proxy does two things, in this order:
//   1. Auth gate for protected sections (`/projects/*` — with or without
//      locale prefix). If the auth cookie is absent, redirect to /login
//      preserving the locale and a `next=` param so we bounce the user back
//      after a successful login.
//   2. Locale routing via next-intl. With `as-needed`, the default locale
//      (pt-BR) has no URL prefix; other locales (en) get a `/en/...` prefix.
//
// We do NOT decode the JWT here — cookie presence is enough for routing;
// expired tokens surface as 401s from the API and are handled by pages.

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PATH = /^\/(?:projects)(?:\/.*)?$/;

function stripLocalePrefix(pathname: string): {
  locale: string | null;
  pathnameWithoutLocale: string;
} {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return {
        locale,
        pathnameWithoutLocale: pathname.slice(`/${locale}`.length) || "/",
      };
    }
  }
  return { locale: null, pathnameWithoutLocale: pathname };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { locale, pathnameWithoutLocale } = stripLocalePrefix(pathname);

  if (PROTECTED_PATH.test(pathnameWithoutLocale)) {
    const hasAuth = request.cookies.has("access_token");
    if (!hasAuth) {
      const prefix = locale && locale !== routing.defaultLocale ? `/${locale}` : "";
      const loginUrl = new URL(`${prefix}/login`, request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
}

// Match everything except the BFF proxy (`/api/*`), Next internals, and
// static files (paths with a dot, e.g. /favicon.ico).
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
