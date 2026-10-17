import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { type AppDatabase, createDatabase } from "@recent/db";
import { sql } from "kysely";
import { adminRoutes } from "../../core/src/admin";
import { replayTask, resolveReview, revisePost } from "../../core/src/editorial";
import { readFeed, readStory } from "../../core/src/feed";
import { withOwnership } from "./ownership";
import { collectSource, processTask } from "./pipeline";
import { modelRequest, ProviderError } from "./provider";
import { reconcileTasks } from "./recovery";
import { fetchXPosts } from "./x";
import { recheckXPosts } from "./x-maintenance";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
let db: AppDatabase;
const fetchTarget: { fetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> } =
  globalThis;
let fetchSpy: ReturnType<typeof spyOn<typeof fetchTarget, "fetch">> | undefined;
const keys = { jev: "test", luna: "test" };

async function sourceItem(
  options: { title?: string; excerpt?: string; externalId?: string; kind?: "rss" | "x" } = {},
) {
  const now = new Date();
  const sourceId = randomUUID();
  const id = randomUUID();
  await db
    .insertInto("source")
    .values({
      id: sourceId,
      name: "Test author",
      kind: options.kind ?? "rss",
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
      id,
      sourceId,
      externalId: options.externalId ?? null,
      originalUrl:
        options.kind === "x"
          ? `https://x.com/i/status/${options.externalId}`
          : `https://example.com/${id}`,
      canonicalUrl: `https://example.com/${id}`,
      title: options.title ?? "Acme launches a new AI model",
      excerpt: options.excerpt ?? "An original source excerpt.",
      authorName: "Test author",
      publishedAt: now,
      discoveredAt: now,
      contentHash: id,
      conversationId: null,
      referencedPostId: null,
      referenceType: null,
    })
    .execute();
  return await db
    .selectFrom("sourceItem")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
}
async function task(
  itemId: string,
  stage: "classify" | "match" | "publish" = "classify",
  attemptCount = 0,
) {
  const id = randomUUID();
  const item = await db
    .selectFrom("sourceItem")
    .selectAll()
    .where("id", "=", itemId)
    .executeTakeFirstOrThrow();
  await db
    .insertInto("pipelineTask")
    .values({
      id,
      sourceItemId: itemId,
      stage,
      stageVersion: 1,
      inputHash: item.contentHash,
      status: "pending",
      attemptCount,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(Date.now() - 120_000),
    })
    .execute();
  return id;
}
async function classification(itemId: string) {
  const item = await db
    .selectFrom("sourceItem")
    .selectAll()
    .where("id", "=", itemId)
    .executeTakeFirstOrThrow();
  await db
    .insertInto("classificationDecision")
    .values({
      id: randomUUID(),
      sourceItemId: itemId,
      inputHash: item.contentHash,
      modelVersion: "fixture",
      rubricVersion: 1,
      relevant: true,
      contentType: "report",
      confidence: 0.9,
      createdAt: new Date(),
    })
    .execute();
}
async function published(
  itemId: string,
  storyId = randomUUID(),
  role: "main" | "update" = "main",
  publishedAt = new Date(),
) {
  await db
    .insertInto("story")
    .values({
      id: storyId,
      title: "Acme launches a new AI model",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflict((c) => c.column("id").doNothing())
    .execute();
  const id = randomUUID();
  await db
    .insertInto("post")
    .values({
      id,
      sourceItemId: itemId,
      storyId,
      role,
      format: "report",
      status: "published",
      headline: "Original headline",
      body: "An original source excerpt.",
      attribution: "Test author",
      generationModel: "source",
      publishedAt,
    })
    .execute();
  await db
    .insertInto("postRevision")
    .values({
      id: randomUUID(),
      postId: id,
      action: "publish",
      headline: "Original headline",
      body: "An original source excerpt.",
      attribution: "Test author",
      status: "published",
      actorId: "system",
      reason: "Fixture publication",
      createdAt: new Date(),
    })
    .execute();
  return { id, storyId };
}

suite("PostgreSQL reliability and editorial contracts", () => {
  beforeAll(async () => {
    const url = new URL(testUrl ?? "");
    if (url.pathname !== "/recent_test" || !["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Integration tests require an isolated local database named recent_test");
    db = createDatabase(testUrl ?? "");
  });
  beforeEach(async () => {
    await sql`truncate "source", "story", "outboxEvent", "modelBudget", "xReadBudget", "editorialAction", "cacheGeneration" cascade`.execute(
      db,
    );
    process.env.MODEL_MONTHLY_BUDGET_USD = "10";
    process.env.JEV_REQUEST_BUDGET_USD = "0.01";
    process.env.LUNA_REQUEST_BUDGET_USD = "0.01";
  });
  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
  });
  afterAll(async () => {
    await db.destroy();
  });

  test("stale task inputs finish without invoking a provider", async () => {
    const item = await sourceItem();
    const id = await task(item.id);
    await db
      .updateTable("sourceItem")
      .set({ contentHash: "changed-after-enqueue" })
      .where("id", "=", item.id)
      .execute();
    let calls = 0;
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(async () => {
      calls++;
      throw new Error("Unexpected provider call");
    });
    expect(await processTask(db, id, "classify", keys)).toBe("skipped");
    expect(calls).toBe(0);
    expect(
      (
        await db
          .selectFrom("pipelineTask")
          .select("status")
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("completed");
  });

  test("revision history paginates chronologically and rejects cross-resource cursors", async () => {
    const item = await sourceItem();
    const post = await published(item.id);
    await db.deleteFrom("postRevision").where("postId", "=", post.id).execute();
    const rows = Array.from({ length: 55 }, (_, index) => ({
      id: randomUUID(),
      postId: post.id,
      action: "correct" as const,
      headline: `Revision ${index}`,
      body: "Source excerpt",
      attribution: "Author",
      status: "published" as const,
      actorId: "editor",
      reason: "Fixture correction",
      createdAt: new Date(1_700_000_000_000 + index * 1000),
    }));
    await db.insertInto("postRevision").values(rows).execute();
    const app = adminRoutes(
      db,
      async () => "editor",
      async () => {},
    );
    const first = await (await app.request(`/posts/${post.id}/history`)).json();
    expect(first.revisions.map((row: { headline: string }) => row.headline)).toEqual(
      rows.slice(0, 50).map((row) => row.headline),
    );
    const second = await (
      await app.request(`/posts/${post.id}/history?after=${first.nextCursor}`)
    ).json();
    expect(second.revisions.map((row: { headline: string }) => row.headline)).toEqual(
      rows.slice(50).map((row) => row.headline),
    );
    expect(second.nextCursor).toBeNull();
    expect(
      (await app.request(`/posts/${randomUUID()}/history?after=${first.nextCursor}`)).status,
    ).toBe(400);
    expect((await app.request(`/reviews?after=${first.nextCursor}`)).status).toBe(400);
  });

  test("repeated collection accepts a stable RSS ID with a changed link", async () => {
    const item = await sourceItem({ externalId: "stable-guid" });
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(
      async () =>
        new Response(
          `<rss><channel><item><guid>stable-guid</guid><title>Existing item</title><link>https://example.com/new-link</link></item></channel></rss>`,
        ),
    );
    expect((await collectSource(db, item.sourceId)).inserted).toBe(0);
    expect(
      await db
        .selectFrom("sourceItem")
        .select("id")
        .where("sourceId", "=", item.sourceId)
        .execute(),
    ).toHaveLength(1);
  });

  test("overlapping deliveries invoke a model and commit a classification once", async () => {
    const item = await sourceItem();
    const id = await task(item.id);
    let calls = 0;
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(async () => {
      calls++;
      await Bun.sleep(100);
      return jsonResponse({
        model: "fixture",
        answers: { relevant: { noul: 0.01 }, content_type: { choice: "report", confidence: 0.99 } },
      });
    });
    const results = await Promise.all([
      processTask(db, id, "classify", keys),
      processTask(db, id, "classify", keys),
    ]);
    expect(results).toContain("busy");
    expect(calls).toBe(1);
    expect(await db.selectFrom("classificationDecision").selectAll().execute()).toHaveLength(1);
    expect(
      (
        await db
          .selectFrom("pipelineTask")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).attemptCount,
    ).toBe(1);
    expect(await processTask(db, id, "classify", keys)).toBe("skipped");
  });

  test("matching across worker instances creates one story for equivalent events", async () => {
    const first = await sourceItem();
    const second = await sourceItem();
    await classification(first.id);
    await classification(second.id);
    const firstTask = await task(first.id, "match");
    const secondTask = await task(second.id, "match");
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(async () =>
      jsonResponse({ answers: { candidate_0: { choice: "same", confidence: 0.95 } } }),
    );
    const results = await Promise.all([
      processTask(db, firstTask, "match", keys),
      processTask(db, secondTask, "match", keys),
    ]);
    expect(results).toContain("busy");
    await processTask(db, secondTask, "match", keys);
    await processTask(db, firstTask, "match", keys);
    expect(await db.selectFrom("story").selectAll().execute()).toHaveLength(1);
    expect(await db.selectFrom("storyItem").selectAll().execute()).toHaveLength(2);
  });

  test("reconciler restores delivered tasks and skips work with a live database owner", async () => {
    const item = await sourceItem();
    const id = await task(item.id);
    await db
      .insertInto("outboxEvent")
      .values({
        id: randomUUID(),
        kind: "task",
        aggregateId: id,
        createdAt: new Date(),
        deliveredAt: new Date(),
        claimExpiresAt: null,
      })
      .execute();
    await withOwnership(db, [`task:${id}`], async () => {
      expect(await reconcileTasks(db)).toBe(0);
    });
    expect(await reconcileTasks(db)).toBe(1);
    expect(
      await db.selectFrom("outboxEvent").selectAll().where("deliveredAt", "is", null).execute(),
    ).toHaveLength(1);
    expect(await reconcileTasks(db)).toBe(0);
  });

  test("crash-exhausted tasks enter review instead of retrying indefinitely", async () => {
    const item = await sourceItem();
    const id = await task(item.id, "classify", 4);
    await reconcileTasks(db);
    expect(
      (
        await db
          .selectFrom("pipelineTask")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("dead_lettered");
    expect(await db.selectFrom("reviewItem").selectAll().execute()).toHaveLength(1);
  });

  test("provider 429 schedules no earlier than Retry-After and permanent errors stop", async () => {
    const item = await sourceItem();
    const id = await task(item.id);
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(
      async () => new Response(null, { status: 429, headers: { "retry-after": "120" } }),
    );
    const before = Date.now();
    await expect(processTask(db, id, "classify", keys)).rejects.toBeInstanceOf(ProviderError);
    const pending = await db
      .selectFrom("pipelineTask")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(pending.status).toBe("pending");
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 120_000);
    await db
      .updateTable("pipelineTask")
      .set({ nextAttemptAt: new Date() })
      .where("id", "=", id)
      .execute();
    fetchSpy.mockImplementation(async () => new Response(null, { status: 401 }));
    await expect(processTask(db, id, "classify", keys)).rejects.toBeInstanceOf(ProviderError);
    expect(
      (
        await db
          .selectFrom("pipelineTask")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe("dead_lettered");
  });

  test("monthly model reservations are atomic across concurrent callers", async () => {
    const item = await sourceItem();
    process.env.MODEL_MONTHLY_BUDGET_USD = "0.01";
    let requests = 0;
    const run = () =>
      modelRequest(db, item.id, "jev", "test", async () => {
        requests++;
        return jsonResponse({ usage: { input_tokens: 10, output_tokens: 2 } });
      });
    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(requests).toBe(1);
    expect(
      (await db.selectFrom("modelBudget").selectAll().executeTakeFirstOrThrow()).requests,
    ).toBe(1);
  });

  test("editor approval advances uncertain classification, records actor, and cannot run twice", async () => {
    const item = await sourceItem();
    await classification(item.id);
    const reviewId = randomUUID();
    await db
      .insertInto("reviewItem")
      .values({
        id: reviewId,
        sourceItemId: item.id,
        status: "open",
        reason: "uncertain_classification",
        createdAt: new Date(),
      })
      .execute();
    await resolveReview(db, reviewId, "editor", {
      action: "approve",
      reason: "Verified against the source",
    });
    const task = await db.selectFrom("pipelineTask").selectAll().executeTakeFirstOrThrow();
    expect(task.stage).toBe("match");
    expect(
      (await db.selectFrom("reviewItem").selectAll().executeTakeFirstOrThrow()).resolvedBy,
    ).toBe("editor");
    await expect(
      resolveReview(db, reviewId, "editor", { action: "approve", reason: "Duplicate action" }),
    ).rejects.toThrow("already been resolved");
  });

  test("rejected evidence blocks replay and admin routes deny non-admins", async () => {
    const item = await sourceItem();
    const id = await task(item.id);
    const reviewId = randomUUID();
    await db
      .insertInto("reviewItem")
      .values({
        id: reviewId,
        sourceItemId: item.id,
        status: "open",
        reason: "uncertain_classification",
        createdAt: new Date(),
      })
      .execute();
    await resolveReview(db, reviewId, "editor", {
      action: "reject",
      reason: "Not supported by source",
    });
    await expect(replayTask(db, id, "editor", "Retry rejected source")).rejects.toThrow("Resolve");
    const routes = adminRoutes(
      db,
      async () => null,
      async () => {},
    );
    expect((await routes.request("/reviews")).status).toBe(403);
  });

  test("correction retains publication time, preserves revisions, and retraction hides content", async () => {
    const item = await sourceItem();
    const post = await published(item.id);
    const before = await db
      .selectFrom("post")
      .selectAll()
      .where("id", "=", post.id)
      .executeTakeFirstOrThrow();
    await revisePost(db, post.id, "editor", {
      action: "correct" as const,
      body: "original source",
      headline: "Corrected headline",
      reason: "More precise excerpt",
    });
    const after = await db
      .selectFrom("post")
      .selectAll()
      .where("id", "=", post.id)
      .executeTakeFirstOrThrow();
    expect(after.publishedAt).toEqual(before.publishedAt);
    expect(
      await db.selectFrom("postRevision").selectAll().where("postId", "=", post.id).execute(),
    ).toHaveLength(2);
    await expect(
      revisePost(db, post.id, "editor", {
        action: "correct" as const,
        body: "Invented quotation",
        reason: "Unsupported correction",
      }),
    ).rejects.toThrow("exact excerpt");
    await revisePost(db, post.id, "editor", { action: "retract", reason: "Source was unreliable" });
    expect((await readFeed(db)).cards).toHaveLength(0);
    expect(
      await db.selectFrom("outboxEvent").selectAll().where("kind", "=", "published").execute(),
    ).toHaveLength(2);
  });

  test("threads paginate past 100 cards with the main card first and no duplicates", async () => {
    const storyId = randomUUID();
    const all = [];
    for (let i = 0; i < 105; i++) {
      const item = await sourceItem();
      const post = await published(
        item.id,
        storyId,
        i === 104 ? "main" : "update",
        new Date(Date.now() - 10000 + i),
      );
      all.push(post.id);
    }
    let page = await readStory(db, storyId);
    const seen: string[] = [];
    expect(page?.cards[0]?.role).toBe("main");
    while (page) {
      seen.push(...page.cards.map((card) => card.id));
      if (!page.nextCursor) break;
      page = await readStory(db, storyId, page.nextCursor);
    }
    expect(new Set(seen).size).toBe(105);
    expect(seen).toHaveLength(105);
    const first = await readStory(db, storyId);
    await expect(readStory(db, randomUUID(), first?.nextCursor ?? undefined)).rejects.toThrow(
      "Invalid cursor",
    );
    expect(new Set(seen)).toEqual(new Set(all));
  });

  test("X pages retain the old high-water mark until the entire walk is persisted", async () => {
    const request = (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("since_id")).toBe("10");
      return jsonResponse(
        parsed.searchParams.has("pagination_token")
          ? { data: [{ id: "11", text: "Older update" }] }
          : { data: [{ id: "20", text: "Newest update" }], meta: { next_token: "page-two" } },
      );
    }) as (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
    const first = await fetchXPosts(
      "123",
      "Author",
      { sinceId: "10", paginationToken: null, crawlNewestId: null },
      "test",
      false,
      request,
    );
    expect(first.sinceId).toBe("10");
    expect(first.paginationToken).toBe("page-two");
    const second = await fetchXPosts("123", "Author", first, "test", false, request);
    expect(second.sinceId).toBe("20");
    expect(second.paginationToken).toBeNull();
  });

  test("confirmed X deletion retracts display and purges retained source text and revision bodies", async () => {
    const item = await sourceItem({ externalId: "1234", kind: "x" });
    const post = await published(item.id);
    const request = (async () =>
      jsonResponse({
        errors: [
          {
            resource_id: "1234",
            title: "Not Found Error",
            type: "https://api.x.com/2/problems/resource-not-found",
          },
        ],
      })) as (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
    expect(await recheckXPosts(db, "test", request)).toBe(1);
    expect((await readFeed(db)).cards).toHaveLength(0);
    expect(
      (
        await db
          .selectFrom("sourceItem")
          .selectAll()
          .where("id", "=", item.id)
          .executeTakeFirstOrThrow()
      ).excerpt,
    ).toBe("");
    expect(
      (
        await db.selectFrom("postRevision").selectAll().where("postId", "=", post.id).execute()
      ).every((revision) => revision.body === ""),
    ).toBe(true);
  });
  test("collection atomically persists X continuation state before advancing its high-water mark", async () => {
    const fixture = await sourceItem({ externalId: "8", kind: "x" });
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(async (request) => {
      const url = new URL(String(request));
      return jsonResponse(
        url.searchParams.has("pagination_token")
          ? { data: [{ id: "11", text: "Earlier AI update" }] }
          : { data: [{ id: "20", text: "Newest AI update" }], meta: { next_token: "second" } },
      );
    });
    await collectSource(db, fixture.sourceId, "test");
    const pending = await db
      .selectFrom("sourceCursor")
      .selectAll()
      .where("sourceId", "=", fixture.sourceId)
      .executeTakeFirstOrThrow();
    expect(pending.sinceId).toBeNull();
    expect(pending.paginationToken).toBe("second");
    expect(pending.crawlNewestId).toBe("20");
    await collectSource(db, fixture.sourceId, "test");
    const complete = await db
      .selectFrom("sourceCursor")
      .selectAll()
      .where("sourceId", "=", fixture.sourceId)
      .executeTakeFirstOrThrow();
    expect(complete.sinceId).toBe("20");
    expect(complete.paginationToken).toBeNull();
    expect(await db.selectFrom("pipelineTask").selectAll().execute()).toHaveLength(2);
  });

  test("matching can select a lower-ranked candidate in one model request", async () => {
    const item = await sourceItem();
    await classification(item.id);
    const id = await task(item.id, "match");
    const candidates = [randomUUID(), randomUUID()];
    for (const candidate of candidates)
      await db
        .insertInto("story")
        .values({
          id: candidate,
          title: item.title,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    let calls = 0;
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(async () => {
      calls++;
      return jsonResponse({
        answers: {
          candidate_0: { choice: "new", confidence: 0.95 },
          candidate_1: { choice: "same", confidence: 0.95 },
        },
      });
    });
    await processTask(db, id, "match", keys);
    expect(calls).toBe(1);
    const ordered = [...candidates].sort();
    expect((await db.selectFrom("storyItem").selectAll().executeTakeFirstOrThrow()).storyId).toBe(
      ordered[1] ?? "",
    );
  });

  test("approved X edits are reclassified and republish the same card with redacted old text", async () => {
    const item = await sourceItem({ externalId: "5678", kind: "x" });
    const post = await published(item.id);
    await db
      .insertInto("storyItem")
      .values({
        storyId: post.storyId,
        sourceItemId: item.id,
        relationship: "primary",
        createdAt: new Date(),
      })
      .execute();
    const request = (async () =>
      jsonResponse({
        data: [{ id: "5678", text: "The corrected AI release announcement." }],
      })) as (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
    await recheckXPosts(db, "test", request);
    const review = await db.selectFrom("reviewItem").selectAll().executeTakeFirstOrThrow();
    await resolveReview(db, review.id, "editor", {
      action: "approve",
      reason: "Verified edited source",
      storyId: post.storyId,
    });
    fetchSpy = spyOn(fetchTarget, "fetch").mockImplementation(async () =>
      jsonResponse({
        model: "fixture",
        answers: { relevant: { noul: 0.99 }, content_type: { choice: "report", confidence: 0.99 } },
      }),
    );
    for (const stage of ["classify", "match", "publish"] as const) {
      const current = await db
        .selectFrom("pipelineTask")
        .selectAll()
        .where("sourceItemId", "=", item.id)
        .where("stage", "=", stage)
        .executeTakeFirstOrThrow();
      await processTask(db, current.id, stage, keys);
    }
    const current = await db
      .selectFrom("post")
      .selectAll()
      .where("id", "=", post.id)
      .executeTakeFirstOrThrow();
    expect(current.status).toBe("published");
    expect(current.body).toBe("The corrected AI release announcement.");
    expect(await db.selectFrom("post").selectAll().execute()).toHaveLength(1);
    expect((await readFeed(db)).cards[0]?.id).toBe(post.id);
  });
});

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        "content-type": "application/json",
      },
    },
  );
}
