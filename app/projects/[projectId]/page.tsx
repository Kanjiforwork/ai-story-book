import { notFound, redirect } from "next/navigation";

import { ProjectDetail } from "@/components/project-detail";
import { getCurrentPageUser } from "@/server/page-auth";
import { loadServerEnv } from "@/server/env";
import { getProjectDetail } from "@/server/project-service";
import { withDatabase } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentPageUser();
  if (!user) redirect("/");
  const { projectId } = await params;

  const project = withDatabase((database) =>
    getProjectDetail(database, user.id, projectId, loadServerEnv().dataDir),
  );
  if (!project) notFound();

  return <ProjectDetail project={project} user={user} />;
}
