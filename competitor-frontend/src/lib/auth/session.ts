import "server-only";
import { fetchSessionUser, SESSION_COOKIE } from "@mini-algothon/auth";

export async function getSessionUser() {
  return fetchSessionUser(SESSION_COOKIE);
}
