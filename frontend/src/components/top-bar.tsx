"use client";

import { useMutation } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Wordmark } from "@/components/brand/wordmark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";

interface TopBarProps {
  // null when the bar renders on a public page (Vault) and the visitor
  // is not signed in. Public pages still want the nav present, just
  // collapsed to a login/register entry.
  user: { email: string; username: string | null; has_avatar: boolean } | null;
}

// Global top bar — navy background, wordmark left, nav right. Used by
// every (app) page (authenticated) and the (public) Vault routes
// (optionally authenticated).
export function TopBar({ user }: TopBarProps) {
  const t = useTranslations();
  const router = useRouter();

  const logout = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("logout failed");
    },
    onSuccess: () => {
      router.push("/login");
      router.refresh();
    },
  });

  return (
    <header className="bg-nav text-nav-foreground sticky top-0 z-50">
      <div className="flex h-12 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={user ? "/projects" : "/vault"}
          aria-label="Node-Forge"
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <Wordmark size="md" />
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/vault" className="transition-opacity hover:opacity-80">
            {t("nav.nodeVault")}
          </Link>
          {user ? (
            <>
              <span className="opacity-40">|</span>
              <Link
                href="/projects"
                className="transition-opacity hover:opacity-80"
              >
                {t("nav.projects")}
              </Link>
            </>
          ) : null}
          <span className="opacity-40">|</span>
          <LanguageSwitcher />
          <span className="opacity-40">|</span>

          {user ? (
            <>
              <Link
                href="/profile"
                aria-label={t("nav.profileAria")}
                className="flex items-center gap-2 transition-opacity hover:opacity-80"
              >
                <span className="hidden sm:inline">
                  {user.username ?? user.email}
                </span>
                {user.has_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/api/users/me/avatar"
                    alt=""
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-white/30"
                  />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="text-nav-foreground hover:bg-white/10 hover:text-nav-foreground"
              >
                {t("common.logout")}
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="transition-opacity hover:opacity-80"
              >
                {t("auth.login.title")}
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-primary px-3 py-1 text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("auth.register.title")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
