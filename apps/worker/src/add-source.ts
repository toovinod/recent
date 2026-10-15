import { randomUUID } from "node:crypto";
import { createDatabase } from "@recent/db";
import { z } from "zod";

const argumentsSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["atom", "rss", "x"]),
  feedUrl: z
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Source URL must use HTTPS"),
});

const [name, kind, feedUrl] = process.argv.slice(2);
const source = argumentsSchema.parse({ name, kind, feedUrl });
if (source.kind === "x" && !/^https:\/\/x\.com\/i\/user\/\d+$/.test(source.feedUrl)) {
  throw new Error("X source URL must be https://x.com/i/user/<numeric-user-id>");
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = createDatabase(databaseUrl);

try {
  const now = new Date();
  const result = await database
    .insertInto("source")
    .values({
      id: randomUUID(),
      name: source.name,
      kind: source.kind,
      feedUrl: source.feedUrl,
      enabled: true,
      pollIntervalSeconds: source.kind === "x" ? 7200 : 900,
      nextPollAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((conflict) =>
      conflict.column("feedUrl").doUpdateSet({
        name: source.name,
        kind: source.kind,
        enabled: true,
        updatedAt: now,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  console.info(`Source ready: ${result.id}`);
} finally {
  await database.destroy();
}
