import { notFound } from "next/navigation";

import { Editor } from "@/components/editor/Editor";
import { DEFAULT_CONFIG } from "@/lib/graph-types";
import { getServerProject, requireUser } from "@/lib/server-api";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const project = await getServerProject(id);
  if (!project) notFound();

  // The migration does not seed graph_json, but `default=lambda:
  // DEFAULT_GRAPH.copy()` on the model populates it on insert. Old rows or
  // partial payloads still get a full default here so the editor never
  // hydrates with undefined.
  const graph = project.graph_json ?? {};
  return (
    <Editor
      initial={{
        id: project.id,
        name: project.name,
        graph: {
          nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
          edges: Array.isArray(graph.edges) ? graph.edges : [],
          config: { ...DEFAULT_CONFIG, ...(graph.config ?? {}) },
        },
      }}
    />
  );
}
