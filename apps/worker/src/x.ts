import { createHash } from "node:crypto";
import type { AppDatabase } from "@recent/db";
import { z } from "zod";
import type { FeedItem } from "./feed";

const postSchema = z.object({
  id: z.string().regex(/^\d+$/),
  text: z.string(),
  created_at: z.iso.datetime().optional(),
  conversation_id: z.string().optional(),
  referenced_posts: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["replied_to", "quoted", "retweeted"]),
      }),
    )
    .optional(),
  note_post: z.object({ text: z.string() }).optional(),
});
const timelineSchema = z.object({ data: z.array(postSchema).optional() });

export function parseXPosts(payload: unknown, sourceName: string): FeedItem[] {
  const posts = timelineSchema.parse(payload).data ?? [];
  return posts.flatMap((post): FeedItem[] => {
    if (post.referenced_posts?.some((reference) => reference.type === "retweeted")) return [];
    const body = (post.note_post?.text ?? post.text).trim();
    if (!body) return [];
    const reference = post.referenced_posts?.find(
      (entry) => entry.type === "replied_to" || entry.type === "quoted",
    );
    const url = `https://x.com/i/status/${post.id}`;
    return [
      {
        externalId: post.id,
        originalUrl: url,
        canonicalUrl: url,
        title: body.slice(0, 300),
        authorName: sourceName,
        excerpt: body.slice(0, 4000),
        publishedAt: post.created_at ? new Date(post.created_at) : null,
        contentHash: createHash("sha256").update(body).digest("hex"),
        conversationId: post.conversation_id ?? null,
        referencedPostId: reference?.id ?? null,
        referenceType:
          reference?.type === "replied_to" || reference?.type === "quoted" ? reference.type : null,
      },
    ];
  });
}

export async function reserveXReadBudget(database: AppDatabase): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto("xReadBudget")
      .values({ month, reservedPosts: 0 })
      .onConflict((conflict) => conflict.column("month").doNothing())
      .execute();
    const budget = await transaction
      .selectFrom("xReadBudget")
      .select("reservedPosts")
      .where("month", "=", month)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (budget.reservedPosts + 5 > 2000) throw new Error("X monthly read budget exhausted");
    await transaction
      .updateTable("xReadBudget")
      .set({ reservedPosts: budget.reservedPosts + 5 })
      .where("month", "=", month)
      .execute();
  });
}

export async function fetchXPosts(
  userId: string,
  sourceName: string,
  sinceId: string | null,
  bearerToken: string,
): Promise<{ items: FeedItem[]; sinceId: string | null }> {
  const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
  url.searchParams.set("max_results", "5");
  url.searchParams.set("post.fields", "created_at,conversation_id,referenced_posts,note_post");
  if (sinceId) url.searchParams.set("since_id", sinceId);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`X timeline request failed with status ${response.status}`);
  const payload = await response.json();
  const items = parseXPosts(payload, sourceName);
  const latestId =
    timelineSchema
      .parse(payload)
      .data?.reduce<string | null>(
        (latest, post) => (!latest || BigInt(post.id) > BigInt(latest) ? post.id : latest),
        sinceId,
      ) ?? sinceId;
  return { items, sinceId: latestId };
}
