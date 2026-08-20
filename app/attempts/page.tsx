import { redirect } from "next/navigation";

import { AttemptHistoryPage } from "@/components/attempt-history-page";
import { getCurrentPageUser } from "@/server/page-auth";
import { listAttemptHistory } from "@/server/project-service";
import { withDatabase } from "@/server/storage";

export const dynamic = "force-dynamic";

export default async function AttemptsPage() {
  const user = await getCurrentPageUser();
  if (!user) redirect("/");

  const attempts = withDatabase((database) =>
    listAttemptHistory(database, user.id),
  );
  return <AttemptHistoryPage attempts={attempts} user={user} />;
}
