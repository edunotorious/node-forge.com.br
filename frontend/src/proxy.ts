import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Next 16 renamed `middleware` to `proxy`. Same hook, clearer name.
// This guards `/projects/*` paths: if the auth cookie is absent, the user is
// redirected to /login with a `next=` parameter so we can bounce them back
// after a successful login. We do NOT decode the JWT here — for MVP, cookie
// presence is enough, and any expired token surfaces as a 401 from the API
// which the page layer can handle.

export function proxy(request: NextRequest) {
  const hasAuth = request.cookies.has("access_token");
  if (hasAuth) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/projects", "/projects/:path*"],
};
