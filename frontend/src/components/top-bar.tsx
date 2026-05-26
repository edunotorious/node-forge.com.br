"use client";

import { useMutation } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Wordmark } from "@/components/brand/wordmark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";

interface TopBarProps {
  user: { email: string };
}

// Global authenticated top bar — navy background, wordmark left, nav right.
// Used by every page inside the (app) route group.
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
          href="/projects"
          aria-label="Node-Forge"
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <Wordmark size="md" />
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium">
          <span
            aria-disabled="true"
            title={t("nav.nodeVaultComingSoon")}
            className="cursor-not-allowed opacity-50"
          >
            {t("nav.nodeVault")}
          </span>
          <span className="opacity-40">|</span>
          <Link
            href="/projects"
            className="transition-opacity hover:opacity-80"
          >
            {t("nav.projects")}
          </Link>
          <span className="opacity-40">|</span>
          <LanguageSwitcher />
          <span className="opacity-40">|</span>
          <Link
            href="/profile"
            aria-label={t("nav.profileAria")}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <span className="hidden sm:inline">{user.email}</span>
            <UserRound className="h-5 w-5" />
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
        </nav>
      </div>
    </header>
  );
}
