import "server-only";
import { headers } from "next/headers";

export async function fetchFromCore(path: string, cookie?: string): Promise<Response> {
  const origin =
    process.env.CORE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000";
  return fetch(new URL(path, origin), {
    headers: { cookie: cookie ?? (await headers()).get("cookie") ?? "" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}
