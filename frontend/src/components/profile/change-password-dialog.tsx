"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Values = { current_password: string; new_password: string };

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("profile.changePassword");
  const toastT = useTranslations("profile.toast");

  const schema = z.object({
    current_password: z.string().min(1, t("errors.passwordRequired")),
    new_password: z
      .string()
      .min(12, t("errors.newPasswordMin"))
      .max(72, t("errors.newPasswordMax")),
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "" },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const res = await fetch("/api/auth/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? toastT("passwordChangeFailed"));
      }
    },
    onSuccess: () => {
      toast.success(toastT("passwordChanged"));
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error((err as Error).message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="cp-current">{t("currentPassword")}</Label>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              autoFocus
              {...form.register("current_password")}
            />
            {form.formState.errors.current_password && (
              <p className="text-sm text-destructive">
                {form.formState.errors.current_password.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">{t("newPassword")}</Label>
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              {...form.register("new_password")}
            />
            {form.formState.errors.new_password ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.new_password.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("newPasswordHint")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {mutation.isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
