import { createDatabase } from "@recent/db";
import { DelayedError, Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { createOutboxRelay } from "./outbox";
import { collectSource, dispatchDueSources, processTask } from "./pipeline";
import { ProviderError, retryDelay } from "./provider";
import { reconcileTasks } from "./recovery";
import { recheckXPosts } from "./x-maintenance";

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
const cacheConnection = new IORedis(cacheRedisUrl, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  commandTimeout: 2000,
});
cacheConnection.on("error", (error) =>
  console.error("Cache relay connection error", error.message),
);
for (const name of [
  "MODEL_MONTHLY_BUDGET_USD",
  "JEV_REQUEST_BUDGET_USD",
  "LUNA_REQUEST_BUDGET_USD",
]) {
  z.coerce.number().positive().finite().parse(required(name));
}
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

function metric(name: string, values: Record<string, string | number>): void {
  console.info(JSON.stringify({ metric: name, ...values }));
}

const workers = [
  new Worker(
    queueNames.control,
    async () => {
      const [waiting, active] = await Promise.all([
        queues.collect.getWaitingCount(),
        queues.collect.getActiveCount(),
      ]);
      const outstanding = waiting + active;
      const count =
        outstanding < 40 ? await dispatchDueSources(database, Math.min(20, 40 - outstanding)) : 0;
      const overdue = await database
        .selectFrom("source")
        .select((expression) => expression.fn.countAll<number>().as("count"))
        .where("enabled", "=", true)
        .where("nextPollAt", "<=", new Date())
        .executeTakeFirstOrThrow();
      metric("source_dispatch", { count, outstanding, overdue: Number(overdue.count) });
    },
    { connection: queueConnection, concurrency: 1 },
  ),
  new Worker(
    queueNames.collect,
    async (job) => {
      const started = performance.now();
      let result: Awaited<ReturnType<typeof collectSource>>;
      try {
        result = await collectSource(
          database,
          sourceJobSchema.parse(job.data).sourceId,
          process.env.X_BEARER_TOKEN,
        );
      } catch (error) {
        if (error instanceof ProviderError && !error.retryable)
          throw new UnrecoverableError(error.message);
        throw error;
      }
      metric("source_collection", {
        ...result,
        durationMs: Math.round(performance.now() - started),
        queueWaitMs: Math.max(0, Date.now() - job.timestamp - (performance.now() - started)),
      });
    },
    {
      connection: queueConnection,
      concurrency: 2,
      settings: { backoffStrategy: (attempts, _type, error) => retryDelay(attempts, error) },
    },
  ),
  ...(["classify", "match", "publish"] as const).map(
    (stage) =>
      new Worker(
        queueNames[stage],
        async (job, token) => {
          const { taskId } = taskJobSchema.parse(job.data);
          const started = performance.now();
          try {
            const outcome = await processTask(database, taskId, stage, modelKeys);
            if (outcome === "busy") {
              await job.moveToDelayed(Date.now() + 1000 + Math.floor(Math.random() * 1000), token);
              throw new DelayedError();
            }
            metric("pipeline_stage", {
              stage,
              outcome,
              durationMs: Math.round(performance.now() - started),
              queueWaitMs: Math.max(0, Date.now() - job.timestamp - (performance.now() - started)),
            });
          } catch (error) {
            if (error instanceof DelayedError) throw error;
            metric("pipeline_stage", {
              stage,
              outcome: "failed",
              durationMs: Math.round(performance.now() - started),
              queueWaitMs: Math.max(0, Date.now() - job.timestamp - (performance.now() - started)),
            });
            if (error instanceof ProviderError && !error.retryable)
              throw new UnrecoverableError(error.message);
            throw error;
          }
        },
        {
          connection: queueConnection,
          concurrency: stage === "match" ? 1 : 3,
          settings: { backoffStrategy: (attempts, _type, error) => retryDelay(attempts, error) },
        },
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

const relayOutbox = createOutboxRelay(database, queues, cacheConnection);

async function ensureDispatcher(): Promise<void> {
  await queues.control.upsertJobScheduler(
    "source-dispatch",
    { every: 60_000 },
    {
      name: "dispatch",
      data: {},
      opts: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    },
  );
}
await ensureDispatcher();

let stopping = false;
let relaying = false;
let lastReconciliation = 0;

const relayTimer = setInterval(async () => {
  if (stopping || relaying) return;
  relaying = true;
  try {
    if (Date.now() - lastReconciliation >= 30_000) {
      await ensureDispatcher();
      await reconcileTasks(database);
      const stages = await database
        .selectFrom("pipelineTask")
        .select([
          "stage",
          "status",
          (eb) => eb.fn.countAll<string>().as("count"),
          (eb) => eb.fn.min("createdAt").as("oldest"),
        ])
        .where("status", "in", ["pending", "processing", "dead_lettered"])
        .groupBy(["stage", "status"])
        .execute();
      for (const entry of stages)
        metric("pipeline_backlog", {
          stage: entry.stage,
          status: entry.status,
          count: Number(entry.count),
          ageMs: entry.oldest ? Date.now() - entry.oldest.getTime() : 0,
        });
      lastReconciliation = Date.now();
    }
    await relayOutbox();
  } catch (error) {
    console.error("Outbox relay failed", error);
  } finally {
    relaying = false;
  }
}, 1000);

let rechecking = false;
async function checkX(): Promise<void> {
  if (stopping || !process.env.X_BEARER_TOKEN || rechecking) return;
  rechecking = true;
  try {
    await recheckXPosts(database, process.env.X_BEARER_TOKEN);
  } catch (error) {
    console.error("X source recheck failed", error);
  } finally {
    rechecking = false;
  }
}
const recheckTimer = setInterval(() => {
  void checkX();
}, 3_600_000);
void checkX();

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(relayTimer);
  clearInterval(recheckTimer);
  const deadline = setTimeout(() => process.exit(1), 30_000).unref();
  try {
    await Promise.all(workers.map((worker) => worker.close()));
    while (relaying || rechecking) await Bun.sleep(25);
    await Promise.all(Object.values(queues).map((queue) => queue.close()));
    await Promise.all([queueConnection.quit(), cacheConnection.quit(), database.destroy()]);
    clearTimeout(deadline);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}

console.info("Recent worker started");
