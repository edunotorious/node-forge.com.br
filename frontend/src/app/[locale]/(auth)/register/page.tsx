"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";

type Values = { email: string; password: string };

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const router = useRouter();

  const schema = z.object({
    email: z.string().email(t("errors.invalidEmail")),
    password: z
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
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? t("errors.registerFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      router.push("/login?registered=1");
    },
  });

  return (
    <div className="w-full max-w-2xl space-y-10">
      <div className="flex justify-center">
        <Wordmark size="xl" />
      </div>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-6"
      >
        <div className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-4">
          <Label
            htmlFor="email"
            className="font-heading text-2xl font-bold justify-self-end"
          >
            {t("email")}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="h-12 rounded-full bg-input/60 px-5 text-base"
            {...register("email")}
          />

          <div />
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          ) : (
            <div />
          )}

          <Label
            htmlFor="password"
            className="font-heading text-2xl font-bold justify-self-end"
          >
            {t("password")}
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-12 rounded-full bg-input/60 px-5 text-base"
            {...register("password")}
          />

          <div />
          {errors.password ? (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("passwordHint")}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 text-sm">
          <span className="text-muted-foreground">{t("hasAccount")}</span>
          <Link href="/login" className="underline hover:opacity-70">
            {t("loginCta")}
          </Link>
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
