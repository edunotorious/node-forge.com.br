"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const QK = ["projects"] as const;

async function listProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Falha ao carregar projetos");
  return res.json();
}

const newSchema = z.object({
  name: z.string().min(1, "Informe um nome").max(255),
  description: z.string().max(2000).optional(),
});
type NewValues = z.infer<typeof newSchema>;

async function createProject(values: NewValues): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) throw new Error("Falha ao criar projeto");
  return res.json();
}

async function deleteProjectReq(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Falha ao deletar projeto");
}

// Built outside the component so React 19's `react-hooks/purity` rule does
// not flag Math.random / new Date — they only run when the user submits, not
// during render.
function buildOptimisticProject(values: NewValues): Project {
  const now = new Date().toISOString();
  return {
    id: "optimistic-" + Math.random().toString(36).slice(2),
    name: values.name,
    description: values.description ?? null,
    created_at: now,
    updated_at: now,
  };
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProjectList({ initialData }: { initialData: Project[] }) {
  const qc = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const projects = useQuery({
    queryKey: QK,
    queryFn: listProjects,
    initialData,
  });

  const createMut = useMutation({
    mutationFn: createProject,
    onMutate: async (vals) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<Project[]>(QK);
      const optimistic = buildOptimisticProject(vals);
      qc.setQueryData<Project[]>(QK, (old = []) => [optimistic, ...old]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error("Falha ao criar projeto");
    },
    onSuccess: () => {
      setNewOpen(false);
      newForm.reset();
      toast.success("Projeto criado");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProjectReq,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<Project[]>(QK);
      qc.setQueryData<Project[]>(QK, (old = []) => old.filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error("Falha ao deletar projeto");
    },
    onSuccess: () => {
      setConfirmingId(null);
      toast.success("Projeto deletado");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const newForm = useForm<NewValues>({
    resolver: zodResolver(newSchema),
    defaultValues: { name: "", description: "" },
  });

  const items = projects.data ?? [];

  return (
    <div className="container mx-auto p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus projetos</h1>
        <Dialog
          open={newOpen}
          onOpenChange={(o) => {
            setNewOpen(o);
            if (o) newForm.reset();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo projeto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo projeto</DialogTitle>
              <DialogDescription>
                Dê um nome para o seu novo circuito.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={newForm.handleSubmit((v) => createMut.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" autoFocus {...newForm.register("name")} />
                {newForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {newForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Input id="description" {...newForm.register("description")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Criar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">Você ainda não tem projetos.</p>
          <Button className="mt-4" onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Crie seu primeiro projeto
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="truncate">{p.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {p.description ?? <span className="italic">Sem descrição</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Atualizado em {formatDate(p.updated_at)}
                </p>
              </CardContent>
              <CardFooter className="justify-between">
                <Button asChild variant="default" size="sm">
                  <Link href={`/projects/${p.id}`}>Abrir</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingId(p.id)}
                  aria-label="Deletar projeto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={confirmingId !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O projeto e todo o seu grafo
              serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmingId) deleteMut.mutate(confirmingId);
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
