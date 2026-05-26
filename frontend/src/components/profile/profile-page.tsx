"use client";

import { PencilLine, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { ChangeEmailDialog } from "@/components/profile/change-email-dialog";
import { ChangePasswordDialog } from "@/components/profile/change-password-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ProfilePageProps {
  user: { id: string; email: string; created_at: string };
}

export function ProfilePage({ user }: ProfilePageProps) {
  const t = useTranslations("profile");
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // Username display is derived from email until a real username column lands
  // — clicking "Change Username" surfaces an "Em breve" toast.
  const usernameStub = user.email.split("@")[0] ?? "";

  function showComingSoon() {
    toast.info(t("changeAvatarComingSoon"));
  }

  return (
    <div className="px-6 py-10 sm:px-12">
      {/* Header: avatar + username + email */}
      <div className="flex items-start gap-6">
        <button
          type="button"
          onClick={showComingSoon}
          aria-label={t("changeAvatarComingSoon")}
          title={t("changeAvatarComingSoon")}
          className="group relative size-32 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10 transition-opacity hover:opacity-90"
        >
          <UserRound className="absolute inset-0 m-auto size-20 text-muted-foreground" />
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
            <PencilLine className="size-8 text-white" />
          </span>
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-4xl font-black sm:text-5xl">
            {usernameStub || t("userSettings.username")}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {user.email}
          </p>
        </div>
      </div>

      {/* Settings card with orange border */}
      <section className="mt-10 grid grid-cols-1 gap-10 rounded-2xl border-2 border-primary/80 bg-card/40 p-8 lg:grid-cols-2">
        {/* LEFT — User Settings */}
        <div className="space-y-6">
          <h2 className="font-heading text-2xl font-black text-primary">
            {t("userSettings.title")}
          </h2>

          <LockedField
            label={t("userSettings.username")}
            value={usernameStub}
            buttonLabel={t("userSettings.changeUsername")}
            onClick={showComingSoon}
            disabledTitle={t("userSettings.usernameComingSoon")}
          />

          <LockedField
            label={t("userSettings.email")}
            value={user.email}
            buttonLabel={t("userSettings.changeEmail")}
            onClick={() => setEmailOpen(true)}
          />

          <LockedField
            label={t("userSettings.password")}
            value={t("userSettings.passwordMasked")}
            buttonLabel={t("userSettings.changePassword")}
            onClick={() => setPasswordOpen(true)}
          />
        </div>

        {/* RIGHT — Vault profile (visual stub, all disabled) */}
        <VaultProfileStub />
      </section>

      <ChangeEmailDialog open={emailOpen} onOpenChange={setEmailOpen} />
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}

interface LockedFieldProps {
  label: string;
  value: string;
  buttonLabel: string;
  onClick: () => void;
  disabledTitle?: string;
}

// Dark-gray locked input with the "Change …" pill button overlapping its right
// side. The input itself is disabled — editing goes through a modal opened by
// the button.
function LockedField({
  label,
  value,
  buttonLabel,
  onClick,
  disabledTitle,
}: LockedFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="font-heading text-sm font-bold">{label}</Label>
      <div className="relative">
        <Input
          value={value}
          disabled
          className={cn(
            "h-10 rounded-md border-transparent bg-zinc-700 pr-44 text-sm text-white",
            "disabled:opacity-100",
          )}
        />
        <Button
          type="button"
          onClick={onClick}
          title={disabledTitle}
          className="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-3 text-xs"
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function VaultProfileStub() {
  const t = useTranslations("profile.vaultProfile");
  return (
    <div className="space-y-4" title={t("comingSoon")}>
      <h2 className="font-heading text-2xl font-black text-primary">
        {t("title")}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <StubField label={t("name")} />
        <StubField label={t("yourSite")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StubTextarea label={t("bio")} rows={6} />
        <div className="space-y-2">
          <Label className="font-heading text-sm font-bold">
            {t("socialAccounts")}
          </Label>
          <Input disabled className="h-10 bg-muted" />
          <Input disabled className="h-10 bg-muted" />
          <Input disabled className="h-10 bg-muted" />
          <Input disabled className="h-10 bg-muted" />
        </div>
      </div>
      <StubField label={t("country")} />
      <div className="space-y-2">
        <Label className="font-heading text-sm font-bold">{t("email")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <span className="grid size-5 place-items-center rounded bg-destructive/90 text-white">
            ×
          </span>
          {t("showEmail")}
        </label>
      </div>
    </div>
  );
}

function StubField({ label }: { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-heading text-sm font-bold">{label}</Label>
      <Input disabled className="h-10 bg-muted" />
    </div>
  );
}

function StubTextarea({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-heading text-sm font-bold">{label}</Label>
      <textarea
        disabled
        rows={rows}
        className="w-full resize-none rounded-md border-transparent bg-muted px-3 py-2 text-sm outline-none disabled:opacity-100"
      />
    </div>
  );
}
