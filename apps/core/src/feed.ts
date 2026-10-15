import {
  type FeedCard,
  type FeedPage,
  feedPageSchema,
  type StoryPage,
  storyPageSchema,
} from "@recent/contracts";
import type { AppDatabase } from "@recent/db";
import { z } from "zod";

const cursorSchema = z.object({
  publishedAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
  snapshotAt: z.iso.datetime({ offset: true }),
});

type Cursor = z.infer<typeof cursorSchema>;

function decodeCursor(value: string): Cursor {
  if (value.length > 500) throw new Error("Invalid cursor");
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new Error("Invalid cursor");
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

interface CardRow {
  id: string;
  storyId: string;
  role: "main" | "update";
  format: FeedCard["format"];
  headline: string;
  body: string;
  attribution: string;
  originalUrl: string;
  sourcePublishedAt: Date | null;
  publishedAt: Date;
}

function toCard(row: CardRow): FeedCard {
  return {
    id: row.id,
    storyId: row.storyId,
    role: row.role,
    format: row.format,
    headline: row.headline,
    body: row.body,
    attribution: row.attribution,
    sourceUrl: row.originalUrl,
    sourcePublishedAt: row.sourcePublishedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function readFeed(database: AppDatabase, cursorValue?: string): Promise<FeedPage> {
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  const snapshotAt = cursor?.snapshotAt ?? new Date().toISOString();
  let query = database
    .selectFrom("post")
    .innerJoin("sourceItem", "sourceItem.id", "post.sourceItemId")
    .select([
      "post.id",
      "post.storyId",
      "post.role",
      "post.format",
      "post.headline",
      "post.body",
      "post.attribution",
      "post.publishedAt",
      "sourceItem.originalUrl",
      "sourceItem.publishedAt as sourcePublishedAt",
    ])
    .where("post.status", "=", "published")
    .where("post.publishedAt", "<=", new Date(snapshotAt));
  if (cursor) {
    query = query.where((expression) =>
      expression.or([
        expression("post.publishedAt", "<", new Date(cursor.publishedAt)),
        expression.and([
          expression("post.publishedAt", "=", new Date(cursor.publishedAt)),
          expression("post.id", "<", cursor.id),
        ]),
      ]),
    );
  }
  const rows = await query
    .orderBy("post.publishedAt", "desc")
    .orderBy("post.id", "desc")
    .limit(21)
    .execute();
  const visible = rows.slice(0, 20);
  const last = visible.at(-1);
  return feedPageSchema.parse({
    cards: visible.map(toCard),
    nextCursor:
      rows.length > 20 && last
        ? encodeCursor({
            publishedAt: last.publishedAt.toISOString(),
            id: last.id,
            snapshotAt,
          })
        : null,
  });
}

export async function readStory(database: AppDatabase, storyId: string): Promise<StoryPage | null> {
  const story = await database
    .selectFrom("story")
    .select(["id", "title"])
    .where("id", "=", storyId)
    .where("status", "=", "active")
    .executeTakeFirst();
  if (!story) return null;
  const rows = await database
    .selectFrom("post")
    .innerJoin("sourceItem", "sourceItem.id", "post.sourceItemId")
    .select([
      "post.id",
      "post.storyId",
      "post.role",
      "post.format",
      "post.headline",
      "post.body",
      "post.attribution",
      "post.publishedAt",
      "sourceItem.originalUrl",
      "sourceItem.publishedAt as sourcePublishedAt",
    ])
    .where("post.storyId", "=", storyId)
    .where("post.status", "=", "published")
    .orderBy("post.publishedAt", "asc")
    .orderBy("post.id", "asc")
    .limit(100)
    .execute();
  return storyPageSchema.parse({
    id: story.id,
    title: story.title,
    cards: rows.map(toCard),
  });
}
