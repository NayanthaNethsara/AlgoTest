// X-Real-IP first, deliberately. The edge proxy overwrites it with the peer
// address, while X-Forwarded-For's leftmost entry is whatever the client sent --
// so trusting that one lets a contestant choose the IP the API records for
// proctoring, and rotate it to slip the per-IP login limit.
export function clientAddress(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  // Fall back to the rightmost forwarded entry: the one the nearest proxy
  // appended, rather than the one furthest from us and closest to the client.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }

  return "";
}
