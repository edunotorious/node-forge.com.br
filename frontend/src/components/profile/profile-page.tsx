"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ChangeEmailDialog } from "@/components/profile/change-email-dialog";
import { ChangePasswordDialog } from "@/components/profile/change-password-dialog";
import { ChangeUsernameDialog } from "@/components/profile/change-username-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface ProfilePageProps {
  user: {
    id: string;
    email: string;
    username: string | null;
    has_avatar: boolean;
    created_at: string;
  };
}

interface VaultProfile {
  name: string | null;
  bio: string | null;
  website: string | null;
  social_accounts: string[];
  country: string | null;
  show_email_on_profile: boolean;
}

const PROFILE_QK = ["profile"] as const;
const SOCIAL_SLOTS = 4;

export function ProfilePage({ user }: ProfilePageProps) {
  const t = useTranslations("profile");
  const router = useRouter();
  const qc = useQueryClient();

  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cache-buster appended on avatar (re)upload so the `<img>` reloads
  // instead of serving the old cached bytes.
  const [avatarCacheKey, setAvatarCacheKey] = useState(0);

  const profileQuery = useQuery<VaultProfile>({
    queryKey: PROFILE_QK,
    queryFn: async () => {
      const r = await fetch("/api/users/me/profile");
      if (!r.ok) throw new Error("failed to load profile");
      return r.json();
    },
  });

  const uploadAvatarMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/users/me/avatar", { method: "PUT", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? t("avatar.uploadFailed"));
      }
    },
    onSuccess: () => {
      toast.success(t("avatar.uploaded"));
      setAvatarCacheKey((k) => k + 1);
      router.refresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const removeAvatarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users/me/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error(t("avatar.removeFailed"));
    },
    onSuccess: () => {
      toast.success(t("avatar.removed"));
      setAvatarCacheKey((k) => k + 1);
      router.refresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    // Accept the same set the backend accepts. The server validates
    // magic bytes regardless, so a wrong type advertised here is caught
    // there — this just gives faster feedback for obviously-wrong files.
    const ok = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
    if (!ok.has(file.type)) {
      toast.error(t("avatar.uploadFailed"));
      return;
    }
    uploadAvatarMut.mutate(file);
  }

  const usernameDisplay = user.username ?? user.email.split("@")[0] ?? "";

  return (
    <div className="px-6 py-10 sm:px-12">
      {/* Header: avatar + username + email */}
      <div className="flex items-start gap-6">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("uploadAvatarAria")}
          className="group relative size-32 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10 transition-opacity hover:opacity-90"
        >
          {user.has_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/users/me/avatar?v=${avatarCacheKey}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <UserRound className="absolute inset-0 m-auto size-20 text-muted-foreground" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
            {uploadAvatarMut.isPending ? (
              <Loader2 className="size-8 animate-spin text-white" />
            ) : (
              <PencilLine className="size-8 text-white" />
            )}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onAvatarPick}
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-4xl font-black sm:text-5xl">
            {usernameDisplay}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {user.email}
          </p>
          {user.has_avatar && (
            <button
              type="button"
              onClick={() => removeAvatarMut.mutate()}
              disabled={removeAvatarMut.isPending}
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" /> {t("avatar.remove")}
            </button>
          )}
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
            value={user.username ?? ""}
            buttonLabel={t("userSettings.changeUsername")}
            onClick={() => setUsernameOpen(true)}
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

        {/* RIGHT — Vault profile (functional) */}
        <VaultProfileForm
          initial={profileQuery.data}
          loading={profileQuery.isLoading}
        />
      </section>

      <ChangeEmailDialog open={emailOpen} onOpenChange={setEmailOpen} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <ChangeUsernameDialog open={usernameOpen} onOpenChange={setUsernameOpen} />

      {/* Hidden: leveraged by tanstack-query invalidation upstream. */}
      {qc ? null : null}
    </div>
  );
}

interface LockedFieldProps {
  label: string;
  value: string;
  buttonLabel: string;
  onClick: () => void;
}

function LockedField({ label, value, buttonLabel, onClick }: LockedFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="font-heading text-base font-extrabold tracking-tight text-foreground">{label}</Label>
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
          className="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-3 text-xs"
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function VaultProfileForm({
  initial,
  loading,
}: {
  initial: VaultProfile | undefined;
  loading: boolean;
}) {
  const t = useTranslations("profile.vaultProfile");
  const tToast = useTranslations("profile.vault");
  const qc = useQueryClient();

  const patchMut = useMutation({
    mutationFn: async (patch: Partial<VaultProfile>) => {
      const res = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("PATCH failed");
      return (await res.json()) as VaultProfile;
    },
    onSuccess: (data) => {
      qc.setQueryData<VaultProfile>(PROFILE_QK, data);
      toast.success(tToast("saved"));
    },
    onError: () => toast.error(tToast("saveFailed")),
  });

  // Per-field blur-save: PATCH only the field that changed if it differs
  // from the cached value. Keeps the wire small and avoids racing the
  // optimistic state.
  function commit(field: keyof VaultProfile, raw: string | boolean) {
    if (!initial) return;
    const next = raw === "" ? null : raw;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((initial[field] as any) === next) return;
    patchMut.mutate({ [field]: next } as Partial<VaultProfile>);
  }

  function commitSocial(idx: number, raw: string) {
    if (!initial) return;
    const next = [...initial.social_accounts];
    while (next.length <= idx) next.push("");
    next[idx] = raw;
    // Drop trailing empties so the persisted array stays compact.
    while (next.length && next[next.length - 1] === "") next.pop();
    patchMut.mutate({ social_accounts: next });
  }

  if (loading || !initial) {
    return (
      <div className="space-y-4">
        <h2 className="font-heading text-2xl font-black text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-black text-primary">
        {t("title")}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label={t("name")}
          defaultValue={initial.name ?? ""}
          onBlur={(v) => commit("name", v)}
        />
        <Field
          label={t("yourSite")}
          defaultValue={initial.website ?? ""}
          onBlur={(v) => commit("website", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldTextarea
          label={t("bio")}
          defaultValue={initial.bio ?? ""}
          onBlur={(v) => commit("bio", v)}
        />
        <div className="space-y-2">
          <Label className="font-heading text-base font-extrabold tracking-tight text-foreground">
            {t("socialAccounts")}
          </Label>
          {Array.from({ length: SOCIAL_SLOTS }).map((_, idx) => (
            <Input
              key={idx}
              defaultValue={initial.social_accounts[idx] ?? ""}
              onBlur={(e) => commitSocial(idx, e.target.value)}
              className="h-10 bg-muted"
            />
          ))}
        </div>
      </div>

      <Field
        label={t("country")}
        defaultValue={initial.country ?? ""}
        onBlur={(v) => commit("country", v)}
      />

      <div className="space-y-2">
        <Label className="font-heading text-base font-extrabold tracking-tight text-foreground">{t("email")}</Label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={initial.show_email_on_profile}
            onChange={(e) => commit("show_email_on_profile", e.target.checked)}
            className="size-4 accent-primary"
          />
          {t("showEmail")}
        </label>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  onBlur,
}: {
  label: string;
  defaultValue: string;
  onBlur: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-heading text-base font-extrabold tracking-tight text-foreground">{label}</Label>
      <Input
        defaultValue={defaultValue}
        onBlur={(e) => onBlur(e.target.value)}
        className="h-10 bg-muted"
      />
    </div>
  );
}

function FieldTextarea({
  label,
  defaultValue,
  onBlur,
}: {
  label: string;
  defaultValue: string;
  onBlur: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-heading text-base font-extrabold tracking-tight text-foreground">{label}</Label>
      <textarea
        defaultValue={defaultValue}
        onBlur={(e) => onBlur(e.target.value)}
        rows={6}
        className="w-full resize-none rounded-md border-transparent bg-muted px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
