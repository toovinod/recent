import "server-only";
import { feedPageSchema, storyPageSchema } from "@recent/contracts";
import { headers } from "next/headers";

async function fetchFromCore(path: string): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(
    `${process.env.CORE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000"}${path}`,
    {
      headers: { cookie },
      cache: "no-store",
    },
  );
}

export async function getFeedPage() {
  const response = await fetchFromCore("/api/feed");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load the news feed");
  return feedPageSchema.parse(await response.json());
}

export async function getStoryPage(storyId: string) {
  const response = await fetchFromCore(`/api/stories/${encodeURIComponent(storyId)}`);
  if (response.status === 401) return { status: "unauthorized" as const };
  if (response.status === 404) return { status: "missing" as const };
  if (!response.ok) throw new Error("Unable to load the story");
  return { status: "found" as const, story: storyPageSchema.parse(await response.json()) };
}
