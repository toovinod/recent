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
  storyId: z.string().uuid().optional(),
  role: z.enum(["main", "update"]).optional(),
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
  if (cursor?.storyId) throw new Error("Invalid cursor");
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
    .where("sourceItem.availability", "=", "active")
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

export async function readStory(
  database: AppDatabase,
  storyId: string,
  cursorValue?: string,
): Promise<StoryPage | null> {
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  if (cursor && (cursor.storyId !== storyId || !cursor.role)) throw new Error("Invalid cursor");
  const snapshotAt = cursor?.snapshotAt ?? new Date().toISOString();
  const story = await database
    .selectFrom("story")
    .select(["id", "title"])
    .where("id", "=", storyId)
    .where("status", "=", "active")
    .executeTakeFirst();
  if (!story) return null;
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
    .where("post.storyId", "=", storyId)
    .where("post.status", "=", "published")
    .where("sourceItem.availability", "=", "active")
    .where("post.publishedAt", "<=", new Date(snapshotAt));
  if (cursor?.role) {
    const role = cursor.role;
    query = query.where((eb) =>
      eb.or([
        eb("post.role", ">", role),
        eb.and([
          eb("post.role", "=", role),
          eb.or([
            eb("post.publishedAt", ">", new Date(cursor.publishedAt)),
            eb.and([
              eb("post.publishedAt", "=", new Date(cursor.publishedAt)),
              eb("post.id", ">", cursor.id),
            ]),
          ]),
        ]),
      ]),
    );
  }
  const rows = await query
    .orderBy("post.role", "asc")
    .orderBy("post.publishedAt", "asc")
    .orderBy("post.id", "asc")
    .limit(21)
    .execute();
  const visible = rows.slice(0, 20);
  const last = visible.at(-1);
  return storyPageSchema.parse({
    id: story.id,
    title: story.title,
    cards: visible.map(toCard),
    nextCursor:
      rows.length > 20 && last
        ? encodeCursor({
            storyId,
            role: last.role,
            id: last.id,
            publishedAt: last.publishedAt.toISOString(),
            snapshotAt,
          })
        : null,
  });
}
