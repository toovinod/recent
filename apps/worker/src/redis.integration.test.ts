import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { type AppDatabase, createDatabase } from "@recent/db";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { sql } from "kysely";
import { PublishedContentCache } from "../../core/src/cache";
import { createOutboxRelay } from "./outbox";
import { reconcileTasks } from "./recovery";

const redisUrl = process.env.TEST_REDIS_URL;
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = redisUrl && databaseUrl ? describe : describe.skip;
let redis: IORedis;
let db: AppDatabase;

suite("real Redis locking and outbox recovery", () => {
  beforeAll(async () => {
    const url = new URL(redisUrl ?? "");
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "56379" ||
      new URL(databaseUrl ?? "").pathname !== "/recent_test" ||
      !["127.0.0.1", "localhost"].includes(new URL(databaseUrl ?? "").hostname)
    )
      throw new Error("Redis integration tests require the isolated local test services");
    redis = new IORedis(redisUrl ?? "", { maxRetriesPerRequest: null });
    db = createDatabase(databaseUrl ?? "");
    await redis.ping();
  });
  afterAll(async () => {
    await redis.quit();
    await db.destroy();
  });

  test("real Redis coalesces invalidated generations across independent API caches", async () => {
    const namespace = `integration-${randomUUID()}`;
    const a = new PublishedContentCache(redisUrl ?? "");
    const b = new PublishedContentCache(redisUrl ?? "");
    let loads = 0;
    const load = async () => {
      const current = ++loads;
      await Bun.sleep(350);
      return current;
    };
    try {
      expect(
        await Promise.all(
          Array.from({ length: 100 }, (_, index) =>
            (index % 2 ? a : b).getOrLoad(namespace, "first", load, 30, 120),
          ),
        ),
      ).toEqual(Array(100).fill(1));
      await redis.set(`${namespace}:generation`, "1");
      expect(
        await Promise.all(
          Array.from({ length: 100 }, (_, index) =>
            (index % 2 ? a : b).getOrLoad(namespace, "first", load, 30, 120),
          ),
        ),
      ).toEqual(Array(100).fill(2));
      expect(loads).toBe(2);
    } finally {
      await a.close();
      await b.close();
    }
  });

  test("a delivered task is re-enqueued after queue data loss and terminal jobs can be replayed", async () => {
    await sql`truncate "source", "story", "outboxEvent" cascade`.execute(db);
    const id = randomUUID();
    const itemId = randomUUID();
    const sourceId = randomUUID();
    const now = new Date();
    await db
      .insertInto("source")
      .values({
        id: sourceId,
        name: "Fixture",
        kind: "rss",
        feedUrl: `https://example.com/${sourceId}`,
        enabled: true,
        pollIntervalSeconds: 900,
        nextPollAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await db
      .insertInto("sourceItem")
      .values({
        id: itemId,
        sourceId,
        externalId: null,
        originalUrl: "https://example.com/post",
        canonicalUrl: "https://example.com/post",
        title: "Test",
        excerpt: "Test",
        authorName: null,
        publishedAt: now,
        discoveredAt: now,
        contentHash: "fixture",
        conversationId: null,
        referencedPostId: null,
        referenceType: null,
      })
      .execute();
    await db
      .insertInto("pipelineTask")
      .values({
        id,
        sourceItemId: itemId,
        stage: "classify",
        stageVersion: 1,
        inputHash: "fixture",
        status: "pending",
        attemptCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: new Date(Date.now() - 120_000),
      })
      .execute();
    const prefix = `test-${randomUUID()}`;
    const queues = {
      collect: new Queue(`${prefix}-collect`, { connection: redis }),
      classify: new Queue(`${prefix}-classify`, { connection: redis }),
      match: new Queue(`${prefix}-match`, { connection: redis }),
      publish: new Queue(`${prefix}-publish`, { connection: redis }),
    };
    const relay = createOutboxRelay(db, queues, redis);
    let worker: Worker | undefined;
    try {
      await reconcileTasks(db);
      await relay();
      expect(await queues.classify.getJob(id)).toBeDefined();
      await queues.classify.obliterate({ force: true });
      expect(await queues.classify.getJob(id)).toBeUndefined();
      await db
        .updateTable("pipelineTask")
        .set({ updatedAt: new Date(Date.now() - 120_000) })
        .where("id", "=", id)
        .execute();
      await reconcileTasks(db);
      await relay();
      expect(await queues.classify.getJob(id)).toBeDefined();
      worker = new Worker(queues.classify.name, async () => {}, { connection: redis });
      const deadline = Date.now() + 3000;
      while (
        (await (await queues.classify.getJob(id))?.getState()) !== "completed" &&
        Date.now() < deadline
      )
        await Bun.sleep(25);
      expect(await (await queues.classify.getJob(id))?.getState()).toBe("completed");
      await worker.close();
      worker = undefined;
      await db
        .updateTable("pipelineTask")
        .set({ updatedAt: new Date(Date.now() - 120_000) })
        .where("id", "=", id)
        .execute();
      await reconcileTasks(db);
      await relay();
      expect(await (await queues.classify.getJob(id))?.getState()).toBe("waiting");
    } finally {
      await worker?.close();
      for (const queue of Object.values(queues)) {
        await queue.obliterate({ force: true });
        await queue.close();
      }
    }
  });
});
