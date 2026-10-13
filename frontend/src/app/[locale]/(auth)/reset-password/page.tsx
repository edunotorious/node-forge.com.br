"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

type Values = { new_password: string };

export default function ResetPasswordPage() {
  // useSearchParams forces client-rendering; Next 16 requires a Suspense
  // boundary so the rest of the tree can still prerender.
  return (
    <Suspense fallback={<div className="w-full max-w-2xl" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const params = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);

  const schema = z.object({
    new_password: z
      .string()
      .min(12, t("errors.passwordMin"))
      .max(72, t("errors.passwordMax")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...values }),
      });
      // The backend's `detail` is English ("Invalid or expired reset
      // token"); the translated message covers every failure the user can
      // act on (used, expired or malformed link → request a new one).
      if (!res.ok) throw new Error(t("errors.resetFailed"));
    },
    onSuccess: () => setDone(true),
  });

  if (!token) {
    return (
      <div className="w-full max-w-2xl space-y-6 text-center">
        <Wordmark size="xl" />
        <p className="text-sm text-destructive">{t("missingToken")}</p>
        <Link href="/forgot-password" className="inline-block underline">
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-2xl space-y-4 text-center">
        <Wordmark size="xl" />
        <h2 className="font-heading text-3xl font-black">
          {t("successTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("successBody")}</p>
        <Link href="/login" className="inline-block underline">
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-10">
      <div className="flex justify-center">
        <Wordmark size="xl" />
      </div>
      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-6"
      >
        <p className="text-center text-sm text-muted-foreground">
          {t("description")}
        </p>
        <div className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-4">
          <Label
            htmlFor="rp-new"
            className="font-heading text-2xl font-bold justify-self-end"
          >
            {t("newPassword")}
          </Label>
          <Input
            id="rp-new"
            type="password"
            autoComplete="new-password"
            className="h-12 rounded-full bg-input/60 px-5 text-base"
            {...register("new_password")}
          />
          <div />
          {errors.new_password ? (
            <p className="text-sm text-destructive">
              {errors.new_password.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("newPasswordHint")}
            </p>
          )}
        </div>

        {mutation.isError && (
          <p className="text-center text-sm text-destructive">
            {(mutation.error as Error).message}
          </p>
        )}

        <div className="flex justify-center">
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="h-14 px-16 text-2xl font-heading font-bold tracking-wide"
          >
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
