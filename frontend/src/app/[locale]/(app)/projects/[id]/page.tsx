import { notFound } from "next/navigation";

import { Editor } from "@/components/editor/Editor";
import {
  DEFAULT_CONFIG,
  type ClassDef,
  type FunctionDef,
  type VariableDef,
} from "@/lib/graph-types";
import {
  getServerProject,
  getServerProjectFile,
  requireUser,
} from "@/lib/server-api";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const project = await getServerProject(id);
  if (!project) notFound();

  // Multi-file split (migration 0004) moved graph_json off `projects` onto
  // `project_files`. Every project has ≥1 file by construction. Sort by
  // position and open the first file on page load — the file tabs UI lets
  // the user switch client-side without a re-render.
  const sortedFiles = [...project.files].sort((a, b) => a.position - b.position);
  const firstFile = sortedFiles[0];
  if (!firstFile) notFound();
  const file = await getServerProjectFile(project.id, firstFile.id);
  if (!file) notFound();

  const graph = file.graph_json ?? {};
  return (
    <Editor
      initial={{
        projectId: project.id,
        projectName: project.name,
        fileId: file.id,
        fileName: file.name,
        files: sortedFiles,
        graph: {
          nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
          edges: Array.isArray(graph.edges) ? graph.edges : [],
          config: { ...DEFAULT_CONFIG, ...(graph.config ?? {}) },
          variables: Array.isArray(graph.variables)
            ? (graph.variables as VariableDef[])
            : [],
          functions: Array.isArray(graph.functions)
            ? (graph.functions as FunctionDef[])
            : [],
          classes: Array.isArray(graph.classes)
            ? (graph.classes as ClassDef[])
            : [],
        },
      }}
    />
  );
}
