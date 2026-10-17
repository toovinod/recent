import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@recent/db";
import IORedis from "ioredis";

interface CacheEntry<T> {
  value: T;
  freshUntil: number;
}
export type CacheRedis = Pick<IORedis, "get" | "set" | "eval" | "quit">;
class CacheUnavailable extends Error {}

export class PublishedContentCache {
  private readonly redis: CacheRedis;
  private readonly ready: Promise<void>;
  private readonly flights = new Map<string, Promise<unknown>>();
  private activeLoads = 0;
  private readonly counters = new Map<string, { count: number; durationMs: number }>();
  private readonly metricsTimer = setInterval(() => this.flushMetrics(), 30_000).unref();
  private readonly waiters: Array<() => void> = [];

  constructor(url: string | CacheRedis) {
    if (typeof url === "string") {
      const redis = new IORedis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        commandTimeout: 1000,
        enableOfflineQueue: false,
      });
      redis.on("error", () => this.metric("redis_error"));
      this.ready = new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          redis.off("ready", done);
          redis.off("error", done);
          resolve();
        };
        const timer = setTimeout(done, 1000);
        redis.once("ready", done);
        redis.once("error", done);
      });
      this.redis = redis;
    } else {
      this.redis = url;
      this.ready = Promise.resolve();
    }
  }

  private metric(outcome: string, durationMs = 0): void {
    const current = this.counters.get(outcome) ?? { count: 0, durationMs: 0 };
    current.count++;
    current.durationMs += durationMs;
    this.counters.set(outcome, current);
  }

  private flushMetrics(): void {
    for (const [outcome, values] of this.counters)
      console.info(JSON.stringify({ metric: "content_cache", outcome, ...values }));
    this.counters.clear();
  }

  async close(): Promise<void> {
    clearInterval(this.metricsTimer);
    this.flushMetrics();
    await this.redis.quit();
  }

  async invalidate(database: AppDatabase, storyId: string): Promise<void> {
    const generations = await database
      .selectFrom("cacheGeneration")
      .select(["key", "generation"])
      .where("key", "in", ["feed", `story:${storyId}`])
      .execute();
    for (const entry of generations)
      await this.redis
        .eval(
          "if (tonumber(redis.call('GET', KEYS[1])) or -1) < tonumber(ARGV[1]) then return redis.call('SET', KEYS[1], ARGV[1]) end return 0",
          1,
          `${entry.key}:generation`,
          entry.generation,
        )
        .catch(() => this.metric("invalidation_deferred"));
  }

  private async command<T>(run: () => Promise<T>): Promise<T> {
    try {
      await this.ready;
      return await run();
    } catch {
      throw new CacheUnavailable("Cache unavailable");
    }
  }

  private async loadBounded<T>(load: () => Promise<T>): Promise<T> {
    if (this.activeLoads >= 4) {
      if (this.waiters.length >= 100) throw new Error("Content service is busy");
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else this.activeLoads++;
    const started = performance.now();
    try {
      return await load();
    } finally {
      this.metric("database_load", Math.round(performance.now() - started));
      const next = this.waiters.shift();
      if (next) next();
      else this.activeLoads--;
    }
  }

  getOrLoad<T>(
    namespace: string,
    key: string,
    load: () => Promise<T>,
    freshSeconds: number,
    staleSeconds: number,
  ): Promise<T> {
    const flightKey = JSON.stringify([namespace, key]);
    const current = this.flights.get(flightKey);
    if (current) {
      this.metric("coalesced");
      return current as Promise<T>;
    }
    const flight = this.read(namespace, key, load, freshSeconds, staleSeconds).finally(() =>
      this.flights.delete(flightKey),
    );
    this.flights.set(flightKey, flight);
    return flight;
  }

  private async read<T>(
    namespace: string,
    key: string,
    load: () => Promise<T>,
    freshSeconds: number,
    staleSeconds: number,
  ): Promise<T> {
    try {
      const generationKey = `${namespace}:generation`;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        let generation = await this.command(() => this.redis.get(generationKey));
        if (generation === null) {
          const seed = `seed-${randomUUID()}`;
          await this.command(() => this.redis.set(generationKey, seed, "NX"));
          generation = (await this.command(() => this.redis.get(generationKey))) ?? seed;
        }
        const cacheKey = `cache:${namespace}:${generation}:${key}`;
        const lockKey = `${cacheKey}:lock`;
        const raw = await this.command(() => this.redis.get(cacheKey));
        let entry: CacheEntry<T> | null = null;
        try {
          entry = raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
        } catch {
          this.metric("corrupt_entry");
        }
        if (entry && entry.freshUntil > Date.now()) {
          this.metric("hit");
          return entry.value;
        }
        const token = randomUUID();
        const locked = await this.command(() => this.redis.set(lockKey, token, "PX", 10_000, "NX"));
        if (!locked) {
          if (entry) {
            this.metric("stale");
            return entry.value;
          }
          this.metric("wait");
          await Bun.sleep(50);
          continue;
        }
        const renewal = setInterval(() => {
          void this.redis
            .eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], 10000) end return 0",
              1,
              lockKey,
              token,
            )
            .catch(() => this.metric("lock_renewal_error"));
        }, 3000);
        try {
          this.metric("miss");
          const value = await this.loadBounded(load);
          try {
            await this.redis.eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] and (redis.call('GET', KEYS[2]) or '0') == ARGV[2] then return redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[4]) end return 0",
              3,
              lockKey,
              generationKey,
              cacheKey,
              token,
              generation,
              JSON.stringify({ value, freshUntil: Date.now() + freshSeconds * 1000 }),
              freshSeconds + staleSeconds + Math.floor(Math.random() * 10),
            );
          } catch {
            this.metric("write_error");
          }
          return value;
        } catch (error) {
          if (entry) {
            this.metric("stale_on_error");
            return entry.value;
          }
          throw error;
        } finally {
          clearInterval(renewal);
          await this.redis
            .eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
              1,
              lockKey,
              token,
            )
            .catch(() => this.metric("unlock_error"));
        }
      }
      throw new Error("Content rebuild timed out");
    } catch (error) {
      if (!(error instanceof CacheUnavailable)) throw error;
      this.metric("database_fallback");
      return this.loadBounded(load);
    }
  }
}
