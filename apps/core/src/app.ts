import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "kysely";
import { adminRoutes } from "./admin";
import type { PublishedContentCache } from "./cache";
import { readFeed, readStory } from "./feed";

export function createApp({
  database: db,
  cache,
  auth,
  webOrigin,
  adminUserIds,
}: {
  database: import("@recent/db").AppDatabase;
  cache: Pick<PublishedContentCache, "getOrLoad" | "invalidate">;
  auth: {
    handler: (request: Request) => Promise<Response> | Response;
    session: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  };
  webOrigin: string;
  adminUserIds: Set<string>;
}) {
  const app = new Hono();
  app.use("*", requestId({ limitLength: 64 }));
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    const started = performance.now();
    c.header("Cache-Control", "private, no-store");
    await next();
    console.info(
      JSON.stringify({
        metric: "http_request",
        requestId: c.get("requestId"),
        method: c.req.method,
        route: c.req.routePath,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  });
  app.use("/api/*", cors({ origin: webOrigin, credentials: true }));
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: "Request body too large" }, 413),
    }),
  );

  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  app.route(
    "/api/admin",
    adminRoutes(
      db,
      async (request) => {
        if (request.headers.get("origin") && request.headers.get("origin") !== webOrigin)
          return null;
        const session = await auth.session(request.headers);
        return session && adminUserIds.has(session.user.id) ? session.user.id : null;
      },
      (storyId) => cache.invalidate(db, storyId),
    ),
  );

  app.use("/api/feed", async (c, next) => {
    const session = await auth.session(c.req.raw.headers);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await next();
  });

  app.use("/api/stories/*", async (c, next) => {
    const session = await auth.session(c.req.raw.headers);
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storyId))
      return c.json({ error: "Invalid story ID" }, 400);
    const cursor = c.req.query("cursor");
    if (cursor && cursor.length > 500) return c.json({ error: "Invalid cursor" }, 400);
    try {
      const story = await cache.getOrLoad(
        `story:${storyId}`,
        cursor ?? "page",
        () => readStory(db, storyId, cursor),
        60,
        180,
      );
      return story ? c.json(story) : c.json({ error: "Story not found" }, 404);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid cursor")
        return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.onError((error, c) => {
    console.error(
      JSON.stringify({
        event: "api_request_failed",
        requestId: c.get("requestId"),
        errorType: error.name,
      }),
    );
    return c.json({ error: "Service temporarily unavailable" }, 503);
  });

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  app.get("/ready", async (c) => {
    try {
      await sql`select 1`.execute(db);
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });
  return app;
}
