"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

type Values = { email: string };

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const [sent, setSent] = useState(false);

  const schema = z.object({
    email: z.string().email(t("errors.invalidEmail")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? t("errors.requestFailed"));
      }
    },
    // Success body is intentionally the same regardless of whether the
    // email matched a real account — the API responds 204 either way to
    // prevent enumeration, and the UI mirrors that.
    onSuccess: () => setSent(true),
  });

  return (
    <div className="w-full max-w-2xl space-y-10">
      <div className="flex justify-center">
        <Wordmark size="xl" />
      </div>

      {sent ? (
        <div className="space-y-4 text-center">
          <h2 className="font-heading text-3xl font-black">
            {t("successTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("successBody")}</p>
          <Link href="/login" className="inline-block underline">
            {t("backToLogin")}
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-6"
        >
          <p className="text-center text-sm text-muted-foreground">
            {t("description")}
          </p>
          <div className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-4">
            <Label
              htmlFor="fp-email"
              className="font-heading text-2xl font-bold justify-self-end"
            >
              {t("email")}
            </Label>
            <Input
              id="fp-email"
              type="email"
              autoComplete="email"
              className="h-12 rounded-full bg-input/60 px-5 text-base"
              {...register("email")}
            />
            <div />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {mutation.isError && (
            <p className="text-center text-sm text-destructive">
              {(mutation.error as Error).message}
            </p>
          )}

          <div className="flex flex-col items-center gap-3">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="h-14 px-16 text-2xl font-heading font-bold tracking-wide"
            >
              {mutation.isPending ? t("submitting") : t("submit")}
            </Button>
            <Link
              href="/login"
              className="text-sm underline hover:opacity-70"
            >
              {t("backToLogin")}
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
