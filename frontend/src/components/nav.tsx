"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function Nav({ user }: { user: { email: string } }) {
  const router = useRouter();

  const logout = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Falha ao sair");
    },
    onSuccess: () => {
      router.push("/login");
      router.refresh();
    },
  });

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <span className="font-semibold">Node-Forge</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sair
          </Button>
        </div>
      </div>
    </nav>
  );
}
