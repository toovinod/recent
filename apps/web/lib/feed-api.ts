import "server-only";
import { feedPageSchema, storyPageSchema } from "@recent/contracts";
import { fetchFromCore } from "./core-request";

export async function getFeedPage() {
  const response = await fetchFromCore("/api/feed");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load the news feed");
  return feedPageSchema.parse(await response.json());
}

export async function getStoryPage(storyId: string) {
  const response = await fetchFromCore(`/api/stories/${encodeURIComponent(storyId)}`);
  if (response.status === 401) return { status: "unauthorized" as const };
  if (response.status === 404 || response.status === 400) return { status: "missing" as const };
  if (!response.ok) throw new Error("Unable to load the story");
  return { status: "found" as const, story: storyPageSchema.parse(await response.json()) };
}
