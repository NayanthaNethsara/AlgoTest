import "server-only";
import { fetchSessionUser, SESSION_COOKIE } from "@labyrithm/auth";

export async function getSessionUser() {
  return fetchSessionUser(SESSION_COOKIE);
}
