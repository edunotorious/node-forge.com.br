import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";
const TOKEN = process.env.INTERNAL_API_TOKEN ?? "";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectFull extends Project {
  graph_json: {
    nodes: unknown[];
    edges: unknown[];
    config: { num_qubits: number; num_classical: number; shots: number };
  };
}

async function backendFetch(path: string, init?: RequestInit) {
  const c = await cookies();
  const t = c.get("access_token");
  const headers = new Headers(init?.headers);
  if (t) headers.set("Cookie", `access_token=${t.value}`);
  headers.set("X-Internal-API-Token", TOKEN);
  return fetch(`${BACKEND}${path}`, { ...init, headers, cache: "no-store" });
}

// Cached per-request: layout and page can both call this without
// double-fetching /auth/me.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const res = await backendFetch("/auth/me");
  if (!res.ok) return null;
  return res.json();
});

// Server-side auth gate. Redirects to /login when the cookie is absent or
// the backend rejects it. Use this in every Server Component under (app) —
// proxy.ts is UX only, not a security boundary.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function listServerProjects(): Promise<Project[]> {
  const res = await backendFetch("/projects");
  if (!res.ok) return [];
  return res.json();
}

export async function getServerProject(id: string): Promise<ProjectFull | null> {
  const res = await backendFetch(`/projects/${id}`);
  if (!res.ok) return null;
  return res.json();
}
