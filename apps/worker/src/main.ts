import { createDatabase } from "@recent/db";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { collectSource, dispatchDueSources, processTask, recordTaskFailure } from "./pipeline";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const database = createDatabase(required("DATABASE_URL"));
const queueRedisUrl = required("QUEUE_REDIS_URL");
const cacheRedisUrl = required("CACHE_REDIS_URL");
if (process.env.NODE_ENV === "production" && queueRedisUrl === cacheRedisUrl) {
  throw new Error("Queue and cache Redis must use separate instances in production");
}
const queueConnection = new IORedis(queueRedisUrl, {
  maxRetriesPerRequest: null,
});
const cacheConnection = new IORedis(cacheRedisUrl, { maxRetriesPerRequest: 1 });
const modelKeys = {
  jev: required("JEV_API_KEY"),
  luna: required("OPENAI_API_KEY"),
};

const queueNames = {
  control: "recent-control",
  collect: "recent-collect",
  classify: "recent-classify",
  match: "recent-match",
  publish: "recent-publish",
} as const;
const queues = {
  control: new Queue(queueNames.control, { connection: queueConnection }),
  collect: new Queue(queueNames.collect, { connection: queueConnection }),
  classify: new Queue(queueNames.classify, { connection: queueConnection }),
  match: new Queue(queueNames.match, { connection: queueConnection }),
  publish: new Queue(queueNames.publish, { connection: queueConnection }),
};

const sourceJobSchema = z.object({ sourceId: z.string().uuid() });
const taskJobSchema = z.object({ taskId: z.string().uuid() });

const workers = [
  new Worker(
    queueNames.control,
    async () => {
      await dispatchDueSources(database);
    },
    { connection: queueConnection, concurrency: 1 },
  ),
  new Worker(
    queueNames.collect,
    async (job) => {
      await collectSource(
        database,
        sourceJobSchema.parse(job.data).sourceId,
        process.env.X_BEARER_TOKEN,
      );
    },
    { connection: queueConnection, concurrency: 2 },
  ),
  ...(["classify", "match", "publish"] as const).map(
    (stage) =>
      new Worker(
        queueNames[stage],
        async (job) => {
          const { taskId } = taskJobSchema.parse(job.data);
          try {
            await processTask(database, taskId, stage, modelKeys);
          } catch (error) {
            await recordTaskFailure(database, taskId, error, job.attemptsMade + 1 >= 4);
            throw error;
          }
        },
        { connection: queueConnection, concurrency: stage === "match" ? 1 : 3 },
      ),
  ),
];

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    console.error("Pipeline job failed", {
      queue: worker.name,
      jobId: job?.id,
      message: error.message,
    });
  });
  worker.on("error", (error) => console.error("Worker connection error", error));
}

async function relayOutbox(): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    const events = await transaction
      .selectFrom("outboxEvent")
      .selectAll()
      .where("deliveredAt", "is", null)
      .orderBy("createdAt")
      .limit(50)
      .forUpdate()
      .skipLocked()
      .execute();
    for (const event of events) {
      if (event.kind === "collect") {
        await queues.collect.add(
          "collect",
          { sourceId: event.aggregateId },
          {
            jobId: event.id,
            attempts: 4,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { age: 86_400 },
          },
        );
      } else if (event.kind === "task") {
        const task = await transaction
          .selectFrom("pipelineTask")
          .select("stage")
          .where("id", "=", event.aggregateId)
          .executeTakeFirstOrThrow();
        await queues[task.stage].add(
          task.stage,
          { taskId: event.aggregateId },
          {
            jobId: event.aggregateId,
            attempts: 4,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { age: 86_400 },
          },
        );
      } else {
        await cacheConnection.incr("feed:generation");
        await cacheConnection.incr(`story:${event.aggregateId}:generation`);
      }
      await transaction
        .updateTable("outboxEvent")
        .set({ deliveredAt: new Date() })
        .where("id", "=", event.id)
        .execute();
    }
  });
}

await queues.control.upsertJobScheduler(
  "source-dispatch",
  { every: 15 * 60_000 },
  {
    name: "dispatch",
    data: {},
    opts: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  },
);

let relaying = false;
const relayTimer = setInterval(async () => {
  if (relaying) return;
  relaying = true;
  try {
    await relayOutbox();
  } catch (error) {
    console.error("Outbox relay failed", error);
  } finally {
    relaying = false;
  }
}, 1000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    clearInterval(relayTimer);
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all(Object.values(queues).map((queue) => queue.close()));
    await Promise.all([queueConnection.quit(), cacheConnection.quit(), database.destroy()]);
    process.exit(0);
  });
}

console.info("Recent worker started");
