import { createHash } from "node:crypto";
import type { AppDatabase } from "@recent/db";
import { z } from "zod";
import type { FeedItem } from "./feed";
import { ProviderError, providerJson } from "./provider";

export const xPostSchema = z.object({
  id: z.string().regex(/^\d+$/),
  text: z.string(),
  author_id: z.string().optional(),
  username: z.string().optional(),
  created_at: z.iso.datetime().optional(),
  conversation_id: z.string().optional(),
  referenced_posts: z
    .array(z.object({ id: z.string(), type: z.enum(["replied_to", "quoted", "retweeted"]) }))
    .optional(),
  note_post: z.object({ text: z.string() }).optional(),
  edit_history_post_ids: z.array(z.string()).optional(),
  withheld: z
    .object({ country_codes: z.array(z.string()).optional(), copyright: z.boolean().optional() })
    .optional(),
});
export const xResponseSchema = z.object({
  data: z.array(xPostSchema).optional(),
  meta: z.object({ next_token: z.string().optional() }).optional(),
  errors: z
    .array(
      z.object({
        resource_id: z.string().optional(),
        value: z.string().optional(),
        title: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
});

export function parseXPosts(payload: unknown, sourceName: string | null): FeedItem[] {
  return (xResponseSchema.parse(payload).data ?? []).flatMap((post) => {
    if (post.referenced_posts?.some((reference) => reference.type === "retweeted") || post.withheld)
      return [];
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
        authorName:
          sourceName ??
          (post.username
            ? `@${post.username}`
            : post.author_id
              ? `X user ${post.author_id}`
              : "Original X author"),
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

export async function reserveXReadBudget(
  database: AppDatabase,
  reads = 5,
  compliance = false,
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const limit = z.coerce
    .number()
    .int()
    .positive()
    .parse(process.env.X_MONTHLY_READ_LIMIT ?? "2000");
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto("xReadBudget")
      .values({ month, reservedPosts: 0 })
      .onConflict((c) => c.column("month").doNothing())
      .execute();
    const budget = await transaction
      .selectFrom("xReadBudget")
      .select("reservedPosts")
      .where("month", "=", month)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (budget.reservedPosts + reads > Math.floor(limit * (compliance ? 1 : 0.8))) {
      const next = new Date(`${month}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      throw new ProviderError("X monthly read budget exhausted", true, next.getTime() - Date.now());
    }
    await transaction
      .updateTable("xReadBudget")
      .set({ reservedPosts: budget.reservedPosts + reads })
      .where("month", "=", month)
      .execute();
  });
}

export interface XCursor {
  sinceId: string | null;
  paginationToken: string | null;
  crawlNewestId: string | null;
}

export function nextXCursor(payload: unknown, cursor: XCursor): XCursor {
  const page = xResponseSchema.parse(payload);
  const newest = (page.data ?? []).reduce<string | null>(
    (latest, post) => (!latest || BigInt(post.id) > BigInt(latest) ? post.id : latest),
    cursor.crawlNewestId ?? cursor.sinceId,
  );
  const token = page.meta?.next_token ?? null;
  return {
    sinceId: token ? cursor.sinceId : newest,
    paginationToken: token,
    crawlNewestId: token ? newest : null,
  };
}

export async function fetchXPosts(
  userIdOrQuery: string,
  sourceName: string | null,
  cursor: XCursor,
  bearerToken: string,
  search = false,
  request: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
): Promise<{ items: FeedItem[] } & XCursor> {
  const url = new URL(
    search
      ? "https://api.x.com/2/tweets/search/recent"
      : `https://api.x.com/2/users/${userIdOrQuery}/tweets`,
  );
  if (search) {
    url.searchParams.set("query", userIdOrQuery);
    url.searchParams.set("sort_order", "recency");
  }
  url.searchParams.set("max_results", search ? "10" : "5");
  url.searchParams.set("post.fields", "created_at,conversation_id,note_post");
  url.searchParams.set("expansions", "author_id,referenced_posts");
  if (cursor.sinceId) url.searchParams.set("since_id", cursor.sinceId);
  if (cursor.paginationToken)
    url.searchParams.set(search ? "next_token" : "pagination_token", cursor.paginationToken);
  const payload = await providerJson(
    await request(url, {
      headers: { authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(15_000),
    }),
    "X timeline",
  );
  const parsed = xResponseSchema.parse(payload);
  if (parsed.errors?.length && !parsed.data?.length)
    throw new ProviderError(
      "X returned a partial collection response; cursor retained",
      true,
      60_000,
    );
  return { items: parseXPosts(payload, sourceName), ...nextXCursor(payload, cursor) };
}
