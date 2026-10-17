import { expect, test } from "bun:test";
import { type CacheRedis, PublishedContentCache } from "./cache";

function fakeRedis() {
  const values = new Map<string, { value: string; expires: number }>();
  let unavailable = false;
  const get = async (key: string) => {
    if (unavailable) throw new Error("Redis offline");
    const entry = values.get(key);
    return entry && entry.expires > Date.now() ? entry.value : null;
  };
  const redis = {
    get,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (unavailable) throw new Error("Redis offline");
      if (args.includes("NX") && (await get(key))) return null;
      // Recheck synchronously so concurrent callers model Redis's atomic SET NX.
      const existing = values.get(key);
      if (args.includes("NX") && existing && existing.expires > Date.now()) return null;
      const unit = args[0];
      values.set(key, {
        value,
        expires:
          unit === "PX"
            ? Date.now() + Number(args[1])
            : unit === "EX"
              ? Date.now() + Number(args[1]) * 1000
              : Infinity,
      });
      return "OK";
    },
    eval: async (script: string, count: number, ...args: string[]) => {
      if (unavailable) throw new Error("Redis offline");
      const [key = "", second = "", third = ""] = args;
      const token = args[count];
      if ((await get(key)) !== token) return 0;
      if (count === 3) {
        if (((await get(second)) ?? "0") !== args[4]) return 0;
        values.set(third, { value: args[5] ?? "", expires: Date.now() + Number(args[6]) * 1000 });
      } else if (script.includes("PEXPIRE")) {
        const entry = values.get(key);
        if (entry) entry.expires = Date.now() + 10000;
      } else values.delete(key);
      return 1;
    },
    quit: async () => "OK",
  } as unknown as CacheRedis;
  return {
    redis,
    setUnavailable: () => {
      unavailable = true;
    },
    values,
  };
}

test("cold and invalidated cache keys have one database rebuild across API instances", async () => {
  const { redis } = fakeRedis();
  const first = new PublishedContentCache(redis);
  const second = new PublishedContentCache(redis);
  let loads = 0;
  const load = async () => {
    const value = ++loads;
    await Bun.sleep(350);
    return value;
  };
  expect(
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        (i % 2 ? first : second).getOrLoad("feed", "first", load, 30, 120),
      ),
    ),
  ).toEqual(Array(60).fill(1));
  await redis.set("feed:generation", "1");
  expect(
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        (i % 2 ? first : second).getOrLoad("feed", "first", load, 30, 120),
      ),
    ),
  ).toEqual(Array(60).fill(2));
  expect(loads).toBe(2);
});

test("Redis outage coalesces the same key and bounds database concurrency for distinct keys", async () => {
  const fixture = fakeRedis();
  fixture.setUnavailable();
  const cache = new PublishedContentCache(fixture.redis);
  let loads = 0;
  let active = 0;
  let peak = 0;
  const load = async () => {
    loads++;
    peak = Math.max(peak, ++active);
    await Bun.sleep(20);
    active--;
    return "db";
  };
  expect(
    await Promise.all(
      Array.from({ length: 40 }, () => cache.getOrLoad("feed", "first", load, 30, 120)),
    ),
  ).toEqual(Array(40).fill("db"));
  expect(loads).toBe(1);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => cache.getOrLoad("feed", String(i), load, 30, 120)),
  );
  expect(peak).toBe(4);
});

test("database errors do not trigger a second database call", async () => {
  const { redis } = fakeRedis();
  const cache = new PublishedContentCache(redis);
  let calls = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      cache.getOrLoad(
        "feed",
        "first",
        async () => {
          calls++;
          await Bun.sleep(10);
          throw new Error("Database offline");
        },
        30,
        120,
      ),
    ),
  );
  expect(calls).toBe(1);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
});

test("invalidation during a rebuild prevents writing an obsolete generation", async () => {
  const { redis, values } = fakeRedis();
  const cache = new PublishedContentCache(redis);
  let oldGeneration: string | null = null;
  await cache.getOrLoad(
    "feed",
    "first",
    async () => {
      oldGeneration = await redis.get("feed:generation");
      await redis.set("feed:generation", "1");
      return "old snapshot";
    },
    30,
    120,
  );
  expect(values.has(`cache:feed:${oldGeneration}:first`)).toBe(false);
  expect(await cache.getOrLoad("feed", "first", async () => "new snapshot", 30, 120)).toBe(
    "new snapshot",
  );
});

test("evicting generation metadata cannot resurrect a previously cached response", async () => {
  const { redis, values } = fakeRedis();
  const cache = new PublishedContentCache(redis);
  let calls = 0;
  expect(await cache.getOrLoad("feed", "first", async () => ++calls, 30, 120)).toBe(1);
  const previous = await redis.get("feed:generation");
  values.delete("feed:generation");
  expect(await cache.getOrLoad("feed", "first", async () => ++calls, 30, 120)).toBe(2);
  expect(await redis.get("feed:generation")).not.toBe(previous);
});
