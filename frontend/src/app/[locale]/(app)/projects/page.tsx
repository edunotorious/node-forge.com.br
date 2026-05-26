import { ProjectList } from "@/components/project-list";
import { listServerProjects, requireUser } from "@/lib/server-api";

export default async function ProjectsPage() {
  await requireUser();
  const projects = await listServerProjects();
  return <ProjectList initialData={projects} />;
}
