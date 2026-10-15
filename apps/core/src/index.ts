import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth, db } from "./auth";
import { PublishedContentCache } from "./cache";
import { config } from "./config";
import { readFeed, readStory } from "./feed";

export const app = new Hono();
const cache = new PublishedContentCache(config.cacheRedisUrl);

app.use("/api/*", cors({ origin: config.webOrigin, credentials: true }));

app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/api/feed", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  await next();
});

app.use("/api/stories/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  await next();
});

app.get("/api/feed", async (c) => {
  const cursor = c.req.query("cursor");
  if (cursor && cursor.length > 500) return c.json({ error: "Invalid cursor" }, 400);
  try {
    const page = await cache.getOrLoad(
      "feed",
      cursor ?? "first",
      () => readFeed(db, cursor),
      30,
      120,
    );
    return c.json(page);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid cursor")
      return c.json({ error: error.message }, 400);
    throw error;
  }
});

app.get("/api/stories/:storyId", async (c) => {
  const storyId = c.req.param("storyId");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(storyId))
    return c.json({ error: "Invalid story ID" }, 400);
  const story = await cache.getOrLoad(
    `story:${storyId}`,
    "page",
    () => readStory(db, storyId),
    60,
    180,
  );
  return story ? c.json(story) : c.json({ error: "Story not found" }, 404);
});

app.onError((error, c) => {
  console.error("API request failed", error);
  return c.json({ error: "Service temporarily unavailable" }, 503);
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await Promise.all([db.destroy(), cache.close()]);
    process.exit(0);
  });
}

export default {
  development: process.env.NODE_ENV !== "production",
  port: Number.parseInt(process.env.PORT ?? "4000", 10),
  fetch: app.fetch,
};
