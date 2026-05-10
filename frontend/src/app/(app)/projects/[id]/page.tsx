import { notFound } from "next/navigation";

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

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold">{project.name}</h1>
      {project.description && (
        <p className="mt-2 text-muted-foreground">{project.description}</p>
      )}
      <div className="mt-8 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        Editor — Phase 6
      </div>
    </div>
  );
}
