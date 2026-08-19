import { redirect } from "next/navigation";

import { ProjectList } from "@/components/project-list";
import { getCurrentPageUser } from "@/server/page-auth";
import { listProjects } from "@/server/project-service";
import { withDatabase } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentPageUser();
  if (!user) redirect("/");

  const projects = withDatabase((database) => listProjects(database, user.id));
  return <ProjectList projects={projects} user={user} />;
}
