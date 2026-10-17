import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@recent/db";
import { sql } from "kysely";
import { LOCK_NAMESPACE } from "./ownership";

export async function reconcileTasks(database: AppDatabase): Promise<number> {
  return database.transaction().execute(async (transaction) => {
    const now = new Date();
    const tasks = await transaction
      .selectFrom("pipelineTask")
      .selectAll()
      .where("status", "in", ["pending", "processing"])
      .where("nextAttemptAt", "<=", sql<Date>`now()`)
      .where("updatedAt", "<", new Date(Date.now() - 60_000))
      .orderBy("updatedAt")
      .limit(100)
      .forUpdate()
      .skipLocked()
      .execute();
    let recovered = 0;
    for (const task of tasks) {
      const lock = await sql<{
        owned: boolean;
      }>`select pg_try_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${`task:${task.id}`})) as owned`.execute(
        transaction,
      );
      if (!lock.rows[0]?.owned) continue;
      const final = task.attemptCount >= 4;
      await transaction
        .updateTable("pipelineTask")
        .set({ status: final ? "dead_lettered" : "pending", updatedAt: now })
        .where("id", "=", task.id)
        .execute();
      if (final) {
        await transaction
          .insertInto("reviewItem")
          .values({
            id: randomUUID(),
            sourceItemId: task.sourceItemId,
            reason: `processing_failed:${task.stage}`,
            status: "open",
            createdAt: now,
          })
          .execute();
      } else {
        const pending = await transaction
          .selectFrom("outboxEvent")
          .select("id")
          .where("kind", "=", "task")
          .where("aggregateId", "=", task.id)
          .where("deliveredAt", "is", null)
          .executeTakeFirst();
        if (!pending)
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
      recovered++;
    }
    console.info(JSON.stringify({ metric: "task_reconciliation", recovered }));
    return recovered;
  });
}
