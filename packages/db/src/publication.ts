import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { Database } from "./schema";

export async function invalidatePublication(
  transaction: Transaction<Database>,
  storyId: string,
): Promise<void> {
  const now = new Date();
  for (const key of ["feed", `story:${storyId}`]) {
    await transaction
      .insertInto("cacheGeneration")
      .values({ key, generation: 1, updatedAt: now })
      .onConflict((c) =>
        c
          .column("key")
          .doUpdateSet({ generation: sql`"cacheGeneration"."generation" + 1`, updatedAt: now }),
      )
      .execute();
  }
  await transaction
    .insertInto("outboxEvent")
    .values({
      id: randomUUID(),
      kind: "published",
      aggregateId: storyId,
      createdAt: now,
      deliveredAt: null,
      claimExpiresAt: null,
    })
    .execute();
}

export async function enqueueStage(
  transaction: Transaction<Database>,
  sourceItemId: string,
  stage: "classify" | "match" | "publish",
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
    .onConflict((c) =>
      c.columns(["sourceItemId", "stage", "stageVersion", "inputHash"]).doNothing(),
    )
    .returning("id")
    .executeTakeFirst();
  if (task)
    await transaction
      .insertInto("outboxEvent")
      .values({
        id: randomUUID(),
        kind: "task",
        aggregateId: task.id,
        createdAt: now,
        deliveredAt: null,
        claimExpiresAt: null,
      })
      .execute();
}

export async function lockSourceItem(
  transaction: Transaction<Database>,
  sourceItemId: string,
): Promise<boolean> {
  const result = await sql<{
    owned: boolean;
  }>`select pg_try_advisory_xact_lock(72410, hashtext(${`item:${sourceItemId}`})) as owned`.execute(
    transaction,
  );
  return result.rows[0]?.owned ?? false;
}
