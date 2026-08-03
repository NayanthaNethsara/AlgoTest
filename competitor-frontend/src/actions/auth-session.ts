"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@mini-algothon/auth";

export async function getSessionTokenAction(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}
