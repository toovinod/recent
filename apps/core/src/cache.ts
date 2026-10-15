import { randomUUID } from "node:crypto";
import IORedis from "ioredis";

interface CacheEntry<T> {
  value: T;
  freshUntil: number;
}

export class PublishedContentCache {
  private readonly redis: IORedis;

  constructor(url: string) {
    this.redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async getOrLoad<T>(
    namespace: string,
    key: string,
    load: () => Promise<T>,
    freshSeconds: number,
    staleSeconds: number,
  ): Promise<T> {
    const generationKey = `${namespace}:generation`;
    const generation = (await this.redis.get(generationKey)) ?? "0";
    const cacheKey = `cache:${namespace}:${generation}:${key}`;
    const lockKey = `${cacheKey}:lock`;
    const cached = await this.redis.get(cacheKey);
    const entry = cached ? (JSON.parse(cached) as CacheEntry<T>) : null;
    if (entry && entry.freshUntil > Date.now()) return entry.value;

    const token = randomUUID();
    const locked = await this.redis.set(lockKey, token, "PX", 10_000, "NX");
    if (locked) {
      try {
        const value = await load();
        if (((await this.redis.get(generationKey)) ?? "0") === generation) {
          const ttl = freshSeconds + staleSeconds + Math.floor(Math.random() * 10);
          await this.redis.set(
            cacheKey,
            JSON.stringify({
              value,
              freshUntil: Date.now() + freshSeconds * 1000,
            }),
            "EX",
            ttl,
          );
        }
        return value;
      } catch (error) {
        if (entry) return entry.value;
        throw error;
      } finally {
        try {
          await this.redis.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
            1,
            lockKey,
            token,
          );
        } catch (error) {
          console.error("Cache lock release failed", error);
        }
      }
    }

    if (entry) return entry.value;
    for (let attempt = 0; attempt < 5; attempt++) {
      await Bun.sleep(50);
      const rebuilt = await this.redis.get(cacheKey);
      if (rebuilt) return (JSON.parse(rebuilt) as CacheEntry<T>).value;
    }
    throw new Error("Published content cache is rebuilding");
  }
}
