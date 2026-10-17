import { randomUUID } from "node:crypto";
import {
  type AppDatabase,
  enqueueStage as createTask,
  type Database,
  invalidatePublication,
  type PipelineStage,
  type SourceItemTable,
} from "@recent/db";
import { sql, type Transaction } from "kysely";
import { storyCandidates } from "./candidates";
import { type FeedItem, fetchFeed } from "./feed";
import { classifyItem, matchStories, selectSourceExcerpt } from "./models";
import { withOwnership } from "./ownership";
import { ProviderError, retryDelay } from "./provider";
import { fetchXPosts, reserveXReadBudget } from "./x";

async function completeTask(transaction: Transaction<Database>, taskId: string): Promise<void> {
  await transaction
    .updateTable("pipelineTask")
    .set({ status: "completed", updatedAt: new Date(), lastError: null })
    .where("id", "=", taskId)
    .execute();
}

async function sendToReview(
  transaction: Transaction<Database>,
  sourceItemId: string,
  reason: string,
): Promise<void> {
  await transaction
    .insertInto("reviewItem")
    .values({
      id: randomUUID(),
      sourceItemId,
      reason,
      status: "open",
      createdAt: new Date(),
    })
    .execute();
}

export async function dispatchDueSources(database: AppDatabase, limit = 20): Promise<number> {
  return database.transaction().execute(async (transaction) => {
    const due = await transaction
      .selectFrom("source")
      .select(["id", "pollIntervalSeconds"])
      .where("enabled", "=", true)
      .where("nextPollAt", "<=", new Date())
      .where((eb) => eb.or([eb("expiresAt", "is", null), eb("expiresAt", ">", new Date())]))
      .orderBy("nextPollAt")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
    for (const source of due) {
      const now = new Date();
      await transaction
        .updateTable("source")
        .set({
          nextPollAt: new Date(now.getTime() + source.pollIntervalSeconds * 1000),
          updatedAt: now,
        })
        .where("id", "=", source.id)
        .execute();
      await transaction
        .insertInto("outboxEvent")
        .values({
          id: randomUUID(),
          kind: "collect",
          aggregateId: source.id,
          createdAt: now,
          deliveredAt: null,
          claimExpiresAt: null,
        })
        .execute();
    }
    return due.length;
  });
}

export function uniqueFeedItems(items: FeedItem[]): FeedItem[] {
  const urls = new Set<string>();
  const ids = new Set<string>();
  return items.filter((item) => {
    if (urls.has(item.canonicalUrl) || (item.externalId && ids.has(item.externalId))) return false;
    urls.add(item.canonicalUrl);
    if (item.externalId) ids.add(item.externalId);
    return true;
  });
}

async function collectSourceOwned(
  database: AppDatabase,
  sourceId: string,
  xBearerToken?: string,
): Promise<{ seen: number; inserted: number; queued: number }> {
  const source = await database
    .selectFrom("source")
    .selectAll()
    .where("id", "=", sourceId)
    .executeTakeFirstOrThrow();
  if (!source.enabled) return { seen: 0, inserted: 0, queued: 0 };
  const cursor = await database
    .selectFrom("sourceCursor")
    .selectAll()
    .where("sourceId", "=", sourceId)
    .executeTakeFirst();
  if (source.kind === "x" || source.kind === "x_search") {
    if (!xBearerToken) throw new Error("X_BEARER_TOKEN is required for X sources");
    await reserveXReadBudget(database, source.kind === "x_search" ? 80 : 40);
  }
  const feed =
    source.kind === "x" || source.kind === "x_search"
      ? await fetchXPosts(
          source.kind === "x_search"
            ? (new URL(source.feedUrl).searchParams.get("query") ?? "")
            : (new URL(source.feedUrl).pathname.split("/").at(-1) ?? ""),
          source.kind === "x_search" ? null : source.name,
          {
            sinceId: cursor?.sinceId ?? null,
            paginationToken: cursor?.paginationToken ?? null,
            crawlNewestId: cursor?.crawlNewestId ?? null,
          },
          xBearerToken ?? "",
          source.kind === "x_search",
        )
      : await fetchFeed(source.feedUrl, {
          etag: cursor?.etag ?? null,
          lastModified: cursor?.lastModified ?? null,
        });
  return database.transaction().execute(async (transaction) => {
    let inserted = 0;
    let queued = 0;
    const items = uniqueFeedItems(feed.items);
    if (items.length > 0) {
      const now = new Date();
      const saved = await transaction
        .insertInto("sourceItem")
        .values(
          items.map((item) => ({
            id: randomUUID(),
            sourceId,
            externalId: item.externalId,
            originalUrl: item.originalUrl,
            canonicalUrl: item.canonicalUrl,
            title: item.title,
            authorName: item.authorName,
            excerpt: item.excerpt,
            publishedAt: item.publishedAt,
            discoveredAt: now,
            contentHash: item.contentHash,
            conversationId: item.conversationId,
            referencedPostId: item.referencedPostId,
            referenceType: item.referenceType,
          })),
        )
        .onConflict((conflict) => conflict.doNothing())
        .returning("id")
        .execute();
      inserted = saved.length;
      const externalIds = items.flatMap((item) => (item.externalId ? [item.externalId] : []));
      const stored = await transaction
        .selectFrom("sourceItem")
        .select(["id", "contentHash"])
        .where("sourceId", "=", sourceId)
        .where((eb) =>
          eb.or([
            eb(
              "canonicalUrl",
              "in",
              items.map((item) => item.canonicalUrl),
            ),
            ...(externalIds.length ? [eb("externalId", "in", externalIds)] : []),
          ]),
        )
        .execute();
      if (stored.length !== items.length)
        throw new Error("Collected source items were not persisted");
      const tasks = await transaction
        .insertInto("pipelineTask")
        .values(
          stored.map((item) => ({
            id: randomUUID(),
            sourceItemId: item.id,
            stage: "classify" as const,
            stageVersion: 1,
            inputHash: item.contentHash,
            status: "pending" as const,
            attemptCount: 0,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflict((conflict) =>
          conflict.columns(["sourceItemId", "stage", "stageVersion", "inputHash"]).doNothing(),
        )
        .returning("id")
        .execute();
      queued = tasks.length;
      if (tasks.length > 0) {
        await transaction
          .insertInto("outboxEvent")
          .values(
            tasks.map((task) => ({
              id: randomUUID(),
              kind: "task" as const,
              aggregateId: task.id,
              createdAt: now,
              deliveredAt: null,
              claimExpiresAt: null,
            })),
          )
          .execute();
      }
    }
    await transaction
      .insertInto("sourceCursor")
      .values({
        sourceId,
        etag: "etag" in feed ? feed.etag : null,
        lastModified: "lastModified" in feed ? feed.lastModified : null,
        sinceId: "sinceId" in feed ? feed.sinceId : null,
        paginationToken: "paginationToken" in feed ? feed.paginationToken : null,
        crawlNewestId: "crawlNewestId" in feed ? feed.crawlNewestId : null,
        lastSuccessAt: new Date(),
      })
      .onConflict((conflict) =>
        conflict.column("sourceId").doUpdateSet({
          etag: "etag" in feed ? feed.etag : (cursor?.etag ?? null),
          lastModified: "lastModified" in feed ? feed.lastModified : (cursor?.lastModified ?? null),
          sinceId: "sinceId" in feed ? feed.sinceId : (cursor?.sinceId ?? null),
          paginationToken: "paginationToken" in feed ? feed.paginationToken : null,
          crawlNewestId: "crawlNewestId" in feed ? feed.crawlNewestId : null,
          lastSuccessAt: new Date(),
        }),
      )
      .execute();
    if ("paginationToken" in feed && feed.paginationToken)
      await transaction
        .updateTable("source")
        .set({ nextPollAt: new Date(Date.now() + 60_000) })
        .where("id", "=", sourceId)
        .execute();
    return { seen: feed.items.length, inserted, queued };
  });
}

export async function collectSource(
  database: AppDatabase,
  sourceId: string,
  xBearerToken?: string,
) {
  return (
    (await withOwnership(database, [`source:${sourceId}`], async (connection) => {
      try {
        return await collectSourceOwned(connection, sourceId, xBearerToken);
      } catch (error) {
        if (error instanceof ProviderError && error.retryAfterMs > 0)
          await connection
            .updateTable("source")
            .set({ nextPollAt: new Date(Date.now() + error.retryAfterMs), updatedAt: new Date() })
            .where("id", "=", sourceId)
            .execute();
        throw error;
      }
    })) ?? { seen: 0, inserted: 0, queued: 0 }
  );
}

async function classify(
  database: AppDatabase,
  taskId: string,
  item: SourceItemTable,
  jevKey: string,
): Promise<void> {
  const reused = await database
    .selectFrom("classificationDecision")
    .innerJoin("sourceItem", "sourceItem.id", "classificationDecision.sourceItemId")
    .select([
      "classificationDecision.relevant",
      "classificationDecision.contentType",
      "classificationDecision.confidence",
      "classificationDecision.modelVersion",
    ])
    .where("sourceItem.contentHash", "=", item.contentHash)
    .whereRef("classificationDecision.inputHash", "=", "sourceItem.contentHash")
    .where("sourceItem.title", "=", item.title)
    .where("sourceItem.excerpt", "=", item.excerpt)
    .where("classificationDecision.rubricVersion", "=", 1)
    .where("classificationDecision.createdAt", ">", new Date(Date.now() - 7 * 86_400_000))
    .orderBy("classificationDecision.createdAt", "desc")
    .executeTakeFirst();
  const decision = reused ?? (await classifyItem(database, item, jevKey));
  console.info(JSON.stringify({ metric: "classification_reuse", reused: Number(Boolean(reused)) }));
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto("classificationDecision")
      .values({
        id: randomUUID(),
        sourceItemId: item.id,
        inputHash: item.contentHash,
        modelVersion: decision.modelVersion,
        rubricVersion: 1,
        relevant: decision.relevant,
        contentType: decision.contentType,
        confidence: decision.confidence,
        createdAt: new Date(),
      })
      .execute();
    if (decision.confidence < 0.7) {
      await sendToReview(transaction, item.id, "uncertain_classification");
    } else if (decision.relevant) {
      await createTask(transaction, item.id, "match", item.contentHash);
    }
    await completeTask(transaction, taskId);
  });
}

async function match(
  database: AppDatabase,
  taskId: string,
  item: SourceItemTable,
  jevKey: string,
): Promise<void> {
  const priorLink = await database
    .selectFrom("storyItem")
    .select("storyId")
    .where("sourceItemId", "=", item.id)
    .executeTakeFirst();
  if (priorLink) {
    await database.transaction().execute(async (transaction) => {
      await createTask(transaction, item.id, "publish", item.contentHash);
      await completeTask(transaction, taskId);
    });
    return;
  }
  const decision = await database
    .selectFrom("classificationDecision")
    .selectAll()
    .where("sourceItemId", "=", item.id)
    .where("inputHash", "=", item.contentHash)
    .orderBy("createdAt", "desc")
    .executeTakeFirstOrThrow();
  const direct = item.referencedPostId
    ? await database
        .selectFrom("sourceItem")
        .innerJoin("storyItem", "storyItem.sourceItemId", "sourceItem.id")
        .innerJoin("story", "story.id", "storyItem.storyId")
        .innerJoin("source", "source.id", "sourceItem.sourceId")
        .select(["story.id", "story.title"])
        .where("sourceItem.externalId", "=", item.referencedPostId)
        .where("source.kind", "in", ["x", "x_search"])
        .where("story.status", "=", "active")
        .executeTakeFirst()
    : null;
  const candidates = direct ? [direct] : await storyCandidates(database, item.title);
  let candidate: { id: string; title: string } | undefined;
  let relationship: { relationship: "same" | "related" | "new"; confidence: number } | null = null;
  const relationships =
    direct && item.referenceType === "replied_to"
      ? [{ candidateId: direct.id, relationship: "same" as const, confidence: 1 }]
      : candidates.length
        ? await matchStories(database, item, candidates, jevKey)
        : [];
  const same = relationships
    .filter((result) => result.relationship === "same" && result.confidence >= 0.75)
    .sort((a, b) => b.confidence - a.confidence);
  if (same.length === 1) {
    relationship = same[0] ?? null;
    candidate = candidates.find((entry) => entry.id === same[0]?.candidateId);
  } else if (same.length > 1 || relationships.some((result) => result.confidence < 0.75)) {
    relationship = { relationship: "same", confidence: 0 };
  }
  await database.transaction().execute(async (transaction) => {
    if (item.referenceType && !direct) {
      await sendToReview(transaction, item.id, "reference_parent_not_found");
      await completeTask(transaction, taskId);
      return;
    }
    if (relationship && relationship.confidence < 0.75) {
      await sendToReview(transaction, item.id, "uncertain_story_match");
      await completeTask(transaction, taskId);
      return;
    }
    const matchedCandidate = relationship?.relationship === "same" ? candidate : undefined;
    const sameStory = Boolean(matchedCandidate);
    const storyId = matchedCandidate?.id ?? randomUUID();
    if (!sameStory) {
      const now = new Date();
      await transaction
        .insertInto("story")
        .values({
          id: storyId,
          title: item.title,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const existing = sameStory
      ? await transaction
          .selectFrom("storyItem")
          .innerJoin("sourceItem", "sourceItem.id", "storyItem.sourceItemId")
          .select("sourceItem.id")
          .where("storyItem.storyId", "=", storyId)
          .where("sourceItem.contentHash", "=", item.contentHash)
          .executeTakeFirst()
      : null;
    const relationshipType = existing
      ? "corroboration"
      : sameStory
        ? decision.contentType === "reaction" || decision.contentType === "opinion"
          ? "reaction"
          : "update"
        : "primary";
    await transaction
      .insertInto("storyItem")
      .values({
        storyId,
        sourceItemId: item.id,
        relationship: relationshipType,
        createdAt: new Date(),
      })
      .onConflict((conflict) => conflict.column("sourceItemId").doNothing())
      .execute();
    if (!existing) await createTask(transaction, item.id, "publish", item.contentHash);
    await completeTask(transaction, taskId);
  });
}

async function publish(
  database: AppDatabase,
  taskId: string,
  item: SourceItemTable,
  lunaKey: string,
): Promise<void> {
  const link = await database
    .selectFrom("storyItem")
    .selectAll()
    .where("sourceItemId", "=", item.id)
    .executeTakeFirstOrThrow();
  if (link.relationship === "corroboration") {
    await database.transaction().execute((transaction) => completeTask(transaction, taskId));
    return;
  }
  const existingPost = await database
    .selectFrom("post")
    .select(["id", "status"])
    .where("sourceItemId", "=", item.id)
    .executeTakeFirst();
  if (existingPost?.status === "published") {
    await database.transaction().execute((transaction) => completeTask(transaction, taskId));
    return;
  }
  if (existingPost) {
    const approvedEdit = await database
      .selectFrom("reviewItem")
      .select("id")
      .where("sourceItemId", "=", item.id)
      .where("reason", "=", "x_source_edited")
      .where("status", "=", "approved")
      .executeTakeFirst();
    if (!approvedEdit)
      throw new ProviderError("Retracted posts require an approved source edit", false);
  }
  const decision = await database
    .selectFrom("classificationDecision")
    .select("contentType")
    .where("sourceItemId", "=", item.id)
    .orderBy("createdAt", "desc")
    .executeTakeFirstOrThrow();
  const source = await database
    .selectFrom("source")
    .select("name")
    .where("id", "=", item.sourceId)
    .executeTakeFirstOrThrow();
  const body = await selectSourceExcerpt(database, item, lunaKey);
  const role = link.relationship === "primary" ? "main" : "update";
  const format = decision.contentType === "reaction" ? "opinion" : decision.contentType;
  await database.transaction().execute(async (transaction) => {
    const now = new Date();
    const post = await transaction
      .insertInto("post")
      .values({
        id: randomUUID(),
        storyId: link.storyId,
        sourceItemId: item.id,
        role,
        format,
        status: "published",
        headline: item.title,
        body,
        attribution: item.authorName ?? source.name,
        generationModel: (item.excerpt || item.title).length > 240 ? "gpt-6-luna" : "source",
        publishedAt: now,
      })
      .onConflict((conflict) =>
        conflict
          .column("sourceItemId")
          .doUpdateSet({
            headline: item.title,
            body,
            format,
            generationModel: (item.excerpt || item.title).length > 240 ? "gpt-6-luna" : "source",
            attribution: item.authorName ?? source.name,
            status: "published",
          })
          .where("post.status", "=", "retracted"),
      )
      .returning("id")
      .executeTakeFirst();
    if (post) {
      await transaction
        .insertInto("postEvidence")
        .values({
          id: randomUUID(),
          postId: post.id,
          sourceItemId: item.id,
          claimText: body,
          sourceExcerpt: body,
        })
        .execute();
      await transaction
        .updateTable("story")
        .set({ updatedAt: now, ...(role === "main" ? { title: item.title } : {}) })
        .where("id", "=", link.storyId)
        .execute();
      await transaction
        .insertInto("postRevision")
        .values({
          id: randomUUID(),
          postId: post.id,
          action: "publish",
          headline: item.title,
          body,
          attribution: item.authorName ?? source.name,
          status: "published",
          actorId: "system",
          reason: "Source-backed publication",
          createdAt: now,
        })
        .execute();
      await invalidatePublication(transaction, link.storyId);
      if (role === "main" && item.externalId && /^https:\/\/x\.com\//.test(item.originalUrl)) {
        const searchUrl = new URL("https://api.x.com/2/tweets/search/recent");
        searchUrl.searchParams.set(
          "query",
          `conversation_id:${item.conversationId ?? item.externalId} -is:retweet`,
        );
        await transaction
          .insertInto("source")
          .values({
            id: randomUUID(),
            name: `Reactions to ${link.storyId}`,
            kind: "x_search",
            feedUrl: searchUrl.toString(),
            enabled: true,
            pollIntervalSeconds: 7200,
            nextPollAt: now,
            expiresAt: new Date(now.getTime() + 7 * 86_400_000),
            createdAt: now,
            updatedAt: now,
          })
          .onConflict((c) => c.column("feedUrl").doNothing())
          .execute();
      }
    }
    await completeTask(transaction, taskId);
  });
}

export async function processTask(
  database: AppDatabase,
  taskId: string,
  stage: PipelineStage,
  keys: { jev: string; luna: string },
): Promise<"completed" | "busy" | "skipped"> {
  const task = await database
    .selectFrom("pipelineTask")
    .selectAll()
    .where("id", "=", taskId)
    .executeTakeFirstOrThrow();
  if (task.status === "completed" || task.status === "dead_lettered") return "skipped";
  if (task.stage !== stage) throw new Error("Task stage mismatch");
  const locks = [`task:${taskId}`, `item:${task.sourceItemId}`];
  if (stage === "match") locks.push("story-matching");
  return (
    (await withOwnership(database, locks, async (connection) => {
      const claimed = await connection
        .updateTable("pipelineTask")
        .set({ status: "processing", attemptCount: sql`"attemptCount" + 1`, updatedAt: new Date() })
        .where("id", "=", taskId)
        .where("status", "in", ["pending", "processing"])
        .where("attemptCount", "<", 4)
        .where("nextAttemptAt", "<=", sql<Date>`now()`)
        .returningAll()
        .executeTakeFirst();
      if (!claimed) return "skipped" as const;
      try {
        const item = await connection
          .selectFrom("sourceItem")
          .selectAll()
          .where("id", "=", task.sourceItemId)
          .executeTakeFirstOrThrow();
        const held = await connection
          .selectFrom("reviewItem")
          .select("id")
          .where("sourceItemId", "=", item.id)
          .where("status", "in", ["open", "rejected"])
          .executeTakeFirst();
        if (item.availability !== "active" || held || claimed.inputHash !== item.contentHash) {
          await connection
            .transaction()
            .execute((transaction) => completeTask(transaction, taskId));
          return "skipped" as const;
        }
        if (stage === "classify") await classify(connection, taskId, item, keys.jev);
        else if (stage === "match") await match(connection, taskId, item, keys.jev);
        else await publish(connection, taskId, item, keys.luna);
        return "completed" as const;
      } catch (error) {
        await recordTaskFailure(
          connection,
          taskId,
          error,
          claimed.attemptCount >= 4 || (error instanceof ProviderError && !error.retryable),
        );
        throw error;
      }
    })) ?? "busy"
  );
}

export async function recordTaskFailure(
  database: AppDatabase,
  taskId: string,
  error: unknown,
  final: boolean,
): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 300) : "Unknown processing error";
  await database.transaction().execute(async (transaction) => {
    const task = await transaction
      .selectFrom("pipelineTask")
      .selectAll()
      .where("id", "=", taskId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (task.status === "completed") return;
    await transaction
      .updateTable("pipelineTask")
      .set({
        status: final ? "dead_lettered" : "pending",
        lastError: message,
        nextAttemptAt: new Date(Date.now() + retryDelay(task.attemptCount, error)),
        updatedAt: new Date(),
      })
      .where("id", "=", taskId)
      .execute();
    if (final)
      await sendToReview(transaction, task.sourceItemId, `processing_failed:${task.stage}`);
  });
}
