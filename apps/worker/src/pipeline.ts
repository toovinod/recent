import { randomUUID } from "node:crypto";
import type { AppDatabase, Database, PipelineStage, SourceItemTable } from "@recent/db";
import { sql, type Transaction } from "kysely";
import { fetchFeed } from "./feed";
import { classifyItem, matchStory, selectSourceExcerpt } from "./models";
import { fetchXPosts, reserveXReadBudget } from "./x";

async function createTask(
  transaction: Transaction<Database>,
  sourceItemId: string,
  stage: PipelineStage,
  inputHash: string,
): Promise<void> {
  const now = new Date();
  const task = await transaction
    .insertInto("pipelineTask")
    .values({
      id: randomUUID(),
      sourceItemId,
      stage,
      stageVersion: 1,
      inputHash,
      status: "pending",
      attemptCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((conflict) =>
      conflict.columns(["sourceItemId", "stage", "stageVersion", "inputHash"]).doNothing(),
    )
    .returning("id")
    .executeTakeFirst();
  if (task) {
    await transaction
      .insertInto("outboxEvent")
      .values({
        id: randomUUID(),
        kind: "task",
        aggregateId: task.id,
        createdAt: now,
        deliveredAt: null,
      })
      .execute();
  }
}

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

export async function dispatchDueSources(database: AppDatabase): Promise<number> {
  return database.transaction().execute(async (transaction) => {
    const due = await transaction
      .selectFrom("source")
      .select(["id", "pollIntervalSeconds"])
      .where("enabled", "=", true)
      .where("nextPollAt", "<=", new Date())
      .orderBy("nextPollAt")
      .limit(20)
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
        })
        .execute();
    }
    return due.length;
  });
}

export async function collectSource(
  database: AppDatabase,
  sourceId: string,
  xBearerToken?: string,
): Promise<void> {
  const source = await database
    .selectFrom("source")
    .selectAll()
    .where("id", "=", sourceId)
    .executeTakeFirstOrThrow();
  if (!source.enabled) return;
  const cursor = await database
    .selectFrom("sourceCursor")
    .selectAll()
    .where("sourceId", "=", sourceId)
    .executeTakeFirst();
  if (source.kind === "x") {
    if (!xBearerToken) throw new Error("X_BEARER_TOKEN is required for X sources");
    await reserveXReadBudget(database);
  }
  const feed =
    source.kind === "x"
      ? await fetchXPosts(
          new URL(source.feedUrl).pathname.split("/").at(-1) ?? "",
          source.name,
          cursor?.sinceId ?? null,
          xBearerToken ?? "",
        )
      : await fetchFeed(source.feedUrl, {
          etag: cursor?.etag ?? null,
          lastModified: cursor?.lastModified ?? null,
        });
  await database.transaction().execute(async (transaction) => {
    for (const item of feed.items) {
      const now = new Date();
      const saved = await transaction
        .insertInto("sourceItem")
        .values({
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
        })
        .onConflict((conflict) => conflict.columns(["sourceId", "canonicalUrl"]).doNothing())
        .returning(["id", "contentHash"])
        .executeTakeFirst();
      const stored =
        saved ??
        (await transaction
          .selectFrom("sourceItem")
          .select(["id", "contentHash"])
          .where("sourceId", "=", sourceId)
          .where("canonicalUrl", "=", item.canonicalUrl)
          .executeTakeFirstOrThrow());
      await createTask(transaction, stored.id, "classify", stored.contentHash);
    }
    await transaction
      .insertInto("sourceCursor")
      .values({
        sourceId,
        etag: "etag" in feed ? feed.etag : null,
        lastModified: "lastModified" in feed ? feed.lastModified : null,
        sinceId: "sinceId" in feed ? feed.sinceId : null,
        lastSuccessAt: new Date(),
      })
      .onConflict((conflict) =>
        conflict.column("sourceId").doUpdateSet({
          etag: "etag" in feed ? feed.etag : (cursor?.etag ?? null),
          lastModified: "lastModified" in feed ? feed.lastModified : (cursor?.lastModified ?? null),
          sinceId: "sinceId" in feed ? feed.sinceId : (cursor?.sinceId ?? null),
          lastSuccessAt: new Date(),
        }),
      )
      .execute();
  });
}

async function classify(
  database: AppDatabase,
  taskId: string,
  item: SourceItemTable,
  jevKey: string,
): Promise<void> {
  const decision = await classifyItem(item, jevKey);
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
        .select(["story.id", "story.title"])
        .where("sourceItem.externalId", "=", item.referencedPostId)
        .where("story.status", "=", "active")
        .executeTakeFirst()
    : null;
  const candidate =
    direct ??
    (await database
      .selectFrom("story")
      .select(["id", "title"])
      .where("status", "=", "active")
      .where("updatedAt", ">", new Date(Date.now() - 30 * 86_400_000))
      .where(sql<boolean>`similarity("title", ${item.title}) >= 0.25`)
      .orderBy(sql`similarity("title", ${item.title})`, "desc")
      .limit(1)
      .executeTakeFirst());
  const relationship =
    direct && item.referenceType === "replied_to"
      ? { relationship: "same" as const, confidence: 1 }
      : candidate
        ? await matchStory(item, candidate.title, jevKey)
        : null;
  await database.transaction().execute(async (transaction) => {
    if (item.referenceType === "replied_to" && !direct) {
      await sendToReview(transaction, item.id, "reply_parent_not_found");
      await completeTask(transaction, taskId);
      return;
    }
    if (relationship && relationship.confidence < 0.75) {
      await sendToReview(transaction, item.id, "uncertain_story_match");
      await completeTask(transaction, taskId);
      return;
    }
    const sameStory = candidate && relationship?.relationship === "same";
    const storyId = sameStory ? candidate.id : randomUUID();
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
      .onConflict((conflict) => conflict.columns(["storyId", "sourceItemId"]).doNothing())
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
  const body = await selectSourceExcerpt(item, lunaKey);
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
        generationModel: item.excerpt.length > 240 ? "gpt-6-luna" : "source",
        publishedAt: now,
      })
      .onConflict((conflict) => conflict.column("sourceItemId").doNothing())
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
        .set({ updatedAt: now })
        .where("id", "=", link.storyId)
        .execute();
      for (const key of ["feed", `story:${link.storyId}`]) {
        await transaction
          .insertInto("cacheGeneration")
          .values({ key, generation: 1, updatedAt: now })
          .onConflict((conflict) =>
            conflict.column("key").doUpdateSet({
              generation: sql`"cacheGeneration"."generation" + 1`,
              updatedAt: now,
            }),
          )
          .execute();
      }
      await transaction
        .insertInto("outboxEvent")
        .values({
          id: randomUUID(),
          kind: "published",
          aggregateId: link.storyId,
          createdAt: now,
          deliveredAt: null,
        })
        .execute();
    }
    await completeTask(transaction, taskId);
  });
}

export async function processTask(
  database: AppDatabase,
  taskId: string,
  stage: PipelineStage,
  keys: { jev: string; luna: string },
): Promise<void> {
  const task = await database
    .selectFrom("pipelineTask")
    .selectAll()
    .where("id", "=", taskId)
    .executeTakeFirstOrThrow();
  if (task.status === "completed" || task.status === "dead_lettered") return;
  if (task.stage !== stage) throw new Error("Task stage mismatch");
  const item = await database
    .selectFrom("sourceItem")
    .selectAll()
    .where("id", "=", task.sourceItemId)
    .executeTakeFirstOrThrow();
  await database
    .updateTable("pipelineTask")
    .set({ status: "processing", updatedAt: new Date() })
    .where("id", "=", taskId)
    .execute();
  if (stage === "classify") await classify(database, taskId, item, keys.jev);
  else if (stage === "match") await match(database, taskId, item, keys.jev);
  else await publish(database, taskId, item, keys.luna);
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
        attemptCount: task.attemptCount + 1,
        lastError: message,
        updatedAt: new Date(),
      })
      .where("id", "=", taskId)
      .execute();
    if (final)
      await sendToReview(transaction, task.sourceItemId, `processing_failed:${task.stage}`);
  });
}
