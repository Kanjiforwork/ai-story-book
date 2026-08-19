import { IdentityForm } from "@/components/identity-form";
import { getCurrentPageUser } from "@/server/page-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getCurrentPageUser()) redirect("/projects");
  return <IdentityForm />;
}
