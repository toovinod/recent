import { randomUUID } from "node:crypto";
import {
  type AppDatabase,
  type Database,
  enqueueStage,
  invalidatePublication,
  lockSourceItem,
} from "@recent/db";
import type { Transaction } from "kysely";
import { z } from "zod";

export class EditorialError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
  }
}
const reasonSchema = z.string().trim().min(3).max(500);
export const resolutionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: reasonSchema,
  storyId: z.string().uuid().nullable().optional(),
});
export const correctionSchema = z.object({
  action: z.enum(["correct", "retract"]),
  reason: reasonSchema,
  headline: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(240).optional(),
});

async function audit(
  transaction: Transaction<Database>,
  action: string,
  aggregateId: string,
  actorId: string,
  reason: string,
) {
  await transaction
    .insertInto("editorialAction")
    .values({
      id: randomUUID(),
      action,
      aggregateId,
      actorId,
      reason,
      createdAt: new Date(),
    })
    .execute();
}

async function replay(transaction: Transaction<Database>, taskId: string) {
  const task = await transaction
    .selectFrom("pipelineTask")
    .selectAll()
    .where("id", "=", taskId)
    .forUpdate()
    .executeTakeFirst();
  if (!task) throw new EditorialError("Task not found", 404);
  const item = await transaction
    .selectFrom("sourceItem")
    .selectAll()
    .where("id", "=", task.sourceItemId)
    .executeTakeFirstOrThrow();
  if (item.availability !== "active") throw new EditorialError("Source item is unavailable");
  const open = await transaction
    .selectFrom("reviewItem")
    .select("id")
    .where("sourceItemId", "=", item.id)
    .where("status", "in", ["open", "rejected"])
    .executeTakeFirst();
  if (open) throw new EditorialError("Resolve the source item's review before replaying");
  if (task.status === "completed") throw new EditorialError("Completed tasks cannot be replayed");
  await transaction
    .updateTable("pipelineTask")
    .set({
      status: "pending",
      attemptCount: 0,
      lastError: null,
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where("id", "=", taskId)
    .execute();
  await transaction
    .insertInto("outboxEvent")
    .values({
      id: randomUUID(),
      kind: "task",
      aggregateId: task.id,
      createdAt: new Date(),
      deliveredAt: null,
      claimExpiresAt: null,
    })
    .execute();
}

export async function replayTask(
  database: AppDatabase,
  taskId: string,
  actorId: string,
  reason: string,
) {
  reasonSchema.parse(reason);
  return database.transaction().execute(async (transaction) => {
    const task = await transaction
      .selectFrom("pipelineTask")
      .select("sourceItemId")
      .where("id", "=", taskId)
      .executeTakeFirst();
    if (!task) throw new EditorialError("Task not found", 404);
    if (!(await lockSourceItem(transaction, task.sourceItemId)))
      throw new EditorialError("Source item is being processed");
    await replay(transaction, taskId);
    await audit(transaction, "replay", taskId, actorId, reason);
  });
}

export async function resolveReview(
  database: AppDatabase,
  reviewId: string,
  actorId: string,
  input: z.infer<typeof resolutionSchema>,
) {
  return database.transaction().execute(async (transaction) => {
    const review = await transaction
      .selectFrom("reviewItem")
      .selectAll()
      .where("id", "=", reviewId)
      .forUpdate()
      .executeTakeFirst();
    if (!review) throw new EditorialError("Review not found", 404);
    if (review.status !== "open") throw new EditorialError("Review has already been resolved");
    if (!(await lockSourceItem(transaction, review.sourceItemId)))
      throw new EditorialError("Source item is being processed");
    const item = await transaction
      .selectFrom("sourceItem")
      .selectAll()
      .where("id", "=", review.sourceItemId)
      .executeTakeFirstOrThrow();
    if (input.action === "approve" && item.availability !== "active")
      throw new EditorialError("Unavailable source items cannot be approved");
    await transaction
      .updateTable("reviewItem")
      .set({
        status: input.action === "approve" ? "approved" : "rejected",
        resolvedBy: actorId,
        resolutionReason: input.reason,
        resolvedAt: new Date(),
      })
      .where("id", "=", reviewId)
      .execute();
    if (input.action === "approve") {
      if (review.reason.startsWith("processing_failed:")) {
        const stage = z.enum(["classify", "match", "publish"]).parse(review.reason.split(":")[1]);
        const task = await transaction
          .selectFrom("pipelineTask")
          .select("id")
          .where("sourceItemId", "=", item.id)
          .where("stage", "=", stage)
          .where("status", "=", "dead_lettered")
          .orderBy("createdAt", "desc")
          .executeTakeFirstOrThrow();
        await replay(transaction, task.id);
      } else if (review.reason === "uncertain_classification") {
        const decision = await transaction
          .selectFrom("classificationDecision")
          .selectAll()
          .where("sourceItemId", "=", item.id)
          .orderBy("createdAt", "desc")
          .executeTakeFirstOrThrow();
        await transaction
          .insertInto("classificationDecision")
          .values({
            ...decision,
            id: randomUUID(),
            relevant: true,
            confidence: 1,
            modelVersion: `editor:${actorId}`,
            createdAt: new Date(),
          })
          .execute();
        await enqueueStage(transaction, item.id, "match", item.contentHash);
      } else {
        if (input.storyId === undefined)
          throw new EditorialError("Choose a storyId, or null to create a new story", 400);
        const now = new Date();
        const existing = await transaction
          .selectFrom("storyItem")
          .select("storyId")
          .where("sourceItemId", "=", item.id)
          .executeTakeFirst();
        if (existing && existing.storyId !== input.storyId)
          throw new EditorialError("The source item already belongs to a different story");
        const storyId = input.storyId ?? randomUUID();
        if (input.storyId) {
          const story = await transaction
            .selectFrom("story")
            .select("id")
            .where("id", "=", storyId)
            .where("status", "=", "active")
            .executeTakeFirst();
          if (!story) throw new EditorialError("Active story not found", 404);
        } else
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
        await transaction
          .insertInto("storyItem")
          .values({
            storyId,
            sourceItemId: item.id,
            relationship: input.storyId ? "update" : "primary",
            createdAt: now,
          })
          .onConflict((c) => c.column("sourceItemId").doNothing())
          .execute();
        await enqueueStage(
          transaction,
          item.id,
          review.reason === "x_source_edited" ? "classify" : "publish",
          item.contentHash,
        );
      }
    }
    await audit(transaction, `review_${input.action}`, reviewId, actorId, input.reason);
  });
}

export async function revisePost(
  database: AppDatabase,
  postId: string,
  actorId: string,
  input: z.infer<typeof correctionSchema>,
): Promise<string> {
  return database.transaction().execute(async (transaction) => {
    const post = await transaction
      .selectFrom("post")
      .selectAll()
      .where("id", "=", postId)
      .forUpdate()
      .executeTakeFirst();
    if (!post) throw new EditorialError("Post not found", 404);
    if (!(await lockSourceItem(transaction, post.sourceItemId)))
      throw new EditorialError("Source item is being processed");
    const source = await transaction
      .selectFrom("sourceItem")
      .selectAll()
      .where("id", "=", post.sourceItemId)
      .executeTakeFirstOrThrow();
    if (
      input.action === "correct" &&
      (source.availability !== "active" || post.status !== "published")
    )
      throw new EditorialError("Only published posts with available evidence can be corrected");
    if (
      input.action === "correct" &&
      (!input.body || !(source.excerpt || source.title).includes(input.body))
    )
      throw new EditorialError(
        "Correction body must be an exact excerpt of the current source",
        400,
      );
    const update = {
      headline: input.action === "correct" ? (input.headline ?? post.headline) : post.headline,
      body: input.action === "correct" ? (input.body ?? post.body) : post.body,
      status: input.action === "retract" ? ("retracted" as const) : ("published" as const),
    };
    await transaction.updateTable("post").set(update).where("id", "=", post.id).execute();
    if (input.action === "correct")
      await transaction
        .updateTable("postEvidence")
        .set({ claimText: update.body, sourceExcerpt: update.body })
        .where("postId", "=", post.id)
        .execute();
    await transaction
      .insertInto("postRevision")
      .values({
        id: randomUUID(),
        postId,
        ...update,
        attribution: post.attribution,
        action: input.action,
        actorId,
        reason: input.reason,
        createdAt: new Date(),
      })
      .execute();
    await audit(transaction, input.action, post.id, actorId, input.reason);
    await invalidatePublication(transaction, post.storyId);
    return post.storyId;
  });
}
