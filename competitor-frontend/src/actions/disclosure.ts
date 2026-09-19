"use server";

import { backendFetch } from "@/lib/api/server";
import type { DisclosureResponse } from "@/types/disclosure";

export async function getDisclosureAction(): Promise<DisclosureResponse | null> {
  try {
    const res = await backendFetch("/api/v1/proctor/disclosure");
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Partial<DisclosureResponse>;
    if (!data.disclosure) {
      return null;
    }
    return {
      disclosure: data.disclosure,
      probedPorts: data.probedPorts ?? [],
    };
  } catch (err: unknown) {
    console.error("Failed to load proctor disclosure:", err);
    return null;
  }
}
