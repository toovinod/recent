import type { AppDatabase, OutboxEventTable, PipelineStage } from "@recent/db";
import type { Queue } from "bullmq";
import type IORedis from "ioredis";

export function createOutboxRelay(
  database: AppDatabase,
  queues: Record<PipelineStage | "collect", Queue>,
  cacheConnection: IORedis,
) {
  async function claimOutboxEvents(): Promise<OutboxEventTable[]> {
    return database.transaction().execute(async (transaction) => {
      const now = new Date();
      const events = await transaction
        .selectFrom("outboxEvent")
        .selectAll()
        .where("deliveredAt", "is", null)
        .where((expression) =>
          expression.or([
            expression("claimExpiresAt", "is", null),
            expression("claimExpiresAt", "<", now),
          ]),
        )
        .orderBy("createdAt")
        .limit(50)
        .forUpdate()
        .skipLocked()
        .execute();
      if (events.length > 0) {
        await transaction
          .updateTable("outboxEvent")
          .set({ claimExpiresAt: new Date(now.getTime() + 60_000) })
          .where(
            "id",
            "in",
            events.map((event) => event.id),
          )
          .execute();
      }
      return events;
    });
  }

  async function deliverOutboxEvent(event: OutboxEventTable): Promise<void> {
    if (event.kind === "collect") {
      await queues.collect.add(
        "collect",
        { sourceId: event.aggregateId },
        {
          jobId: event.id,
          attempts: 4,
          backoff: { type: "provider" },
          removeOnComplete: { age: 86_400 },
        },
      );
    } else if (event.kind === "task") {
      const task = await database
        .selectFrom("pipelineTask")
        .select("stage")
        .where("id", "=", event.aggregateId)
        .executeTakeFirstOrThrow();
      const old = await queues[task.stage].getJob(event.aggregateId);
      if (old && ["completed", "failed"].includes(await old.getState())) await old.remove();
      await queues[task.stage].add(
        task.stage,
        { taskId: event.aggregateId },
        {
          jobId: event.aggregateId,
          attempts: 4,
          backoff: { type: "provider" },
          removeOnComplete: { age: 86_400 },
        },
      );
    } else {
      const generations = await database
        .selectFrom("cacheGeneration")
        .select(["key", "generation"])
        .where("key", "in", ["feed", `story:${event.aggregateId}`])
        .execute();
      for (const entry of generations)
        await cacheConnection.eval(
          "if (tonumber(redis.call('GET', KEYS[1])) or -1) < tonumber(ARGV[1]) then return redis.call('SET', KEYS[1], ARGV[1]) end return 0",
          1,
          `${entry.key}:generation`,
          entry.generation,
        );
    }
    await database
      .updateTable("outboxEvent")
      .set({ deliveredAt: new Date(), claimExpiresAt: null })
      .where("id", "=", event.id)
      .execute();
  }

  async function relayOutbox(): Promise<void> {
    const started = performance.now();
    const events = await claimOutboxEvents();
    let delivered = 0;
    for (let offset = 0; offset < events.length; offset += 5) {
      const results = await Promise.allSettled(
        events.slice(offset, offset + 5).map(deliverOutboxEvent),
      );
      for (const result of results) {
        if (result.status === "fulfilled") delivered++;
        else console.error("Outbox event delivery failed", result.reason);
      }
    }
    if (events.length > 0)
      console.info(
        JSON.stringify({
          metric: "outbox_relay",
          claimed: events.length,
          delivered,
          durationMs: Math.round(performance.now() - started),
        }),
      );
  }

  return relayOutbox;
}
