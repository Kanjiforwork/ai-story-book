import { cookies } from "next/headers";

import { findUserBySessionToken, SESSION_COOKIE_NAME } from "@/server/auth";
import { withDatabase } from "@/server/storage";

export async function getCurrentPageUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return withDatabase((database) => findUserBySessionToken(database, token));
}
