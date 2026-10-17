import type { AppDatabase } from "@recent/db";
import { Hono } from "hono";
import { z } from "zod";
import {
  correctionSchema,
  EditorialError,
  replayTask,
  resolutionSchema,
  resolveReview,
  revisePost,
} from "./editorial";

const pageCursorSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  scope: z.string(),
});
function decodePageCursor(value: string | undefined, scope: string) {
  if (!value) return null;
  if (value.length > 500) throw new EditorialError("Invalid cursor", 400);
  try {
    const cursor = pageCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (cursor.scope !== scope) throw new Error("Wrong cursor scope");
    return cursor;
  } catch {
    throw new EditorialError("Invalid cursor", 400);
  }
}
function pageCursor(row: { id: string; createdAt: Date } | undefined, scope: string) {
  return row
    ? Buffer.from(
        JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString(), scope }),
      ).toString("base64url")
    : null;
}

export function adminRoutes(
  database: AppDatabase,
  getActor: (request: Request) => Promise<string | null>,
  afterPublication: (storyId: string) => Promise<void>,
) {
  const app = new Hono<{ Variables: { actorId: string } }>();
  app.use("*", async (c, next) => {
    const actor = await getActor(c.req.raw);
    if (!actor) return c.json({ error: "Forbidden" }, 403);
    c.set("actorId", actor);
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return c.json({ error: "Invalid request" }, 400);
    if (error instanceof EditorialError) return c.json({ error: error.message }, error.status);
    console.error("Editorial action failed", error);
    return c.json({ error: "Editorial service unavailable" }, 503);
  });
  app.get("/reviews", async (c) => {
    const status = z
      .enum(["open", "approved", "rejected", "resolved"])
      .parse(c.req.query("status") ?? "open");
    const scope = `reviews:${status}`;
    const after = decodePageCursor(c.req.query("after"), scope);
    const items = await database
      .selectFrom("reviewItem")
      .selectAll()
      .where("status", "=", status)
      .$if(Boolean(after), (q) =>
        q.where((eb) =>
          eb.or([
            eb("createdAt", ">", new Date(after?.createdAt ?? "")),
            eb.and([
              eb("createdAt", "=", new Date(after?.createdAt ?? "")),
              eb("id", ">", after?.id ?? ""),
            ]),
          ]),
        ),
      )
      .orderBy("createdAt")
      .orderBy("id")
      .limit(51)
      .execute();
    return c.json({
      items: items.slice(0, 50),
      nextCursor: items.length > 50 ? pageCursor(items[49], scope) : null,
    });
  });
  app.post("/reviews/:id/resolve", async (c) => {
    await resolveReview(
      database,
      z.string().uuid().parse(c.req.param("id")),
      c.get("actorId"),
      resolutionSchema.parse(await c.req.json()),
    );
    return c.json({ status: "resolved" });
  });
  app.post("/tasks/:id/replay", async (c) => {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(await c.req.json());
    await replayTask(
      database,
      z.string().uuid().parse(c.req.param("id")),
      c.get("actorId"),
      input.reason,
    );
    return c.json({ status: "queued" });
  });
  app.post("/posts/:id/revise", async (c) => {
    const storyId = await revisePost(
      database,
      z.string().uuid().parse(c.req.param("id")),
      c.get("actorId"),
      correctionSchema.parse(await c.req.json()),
    );
    await afterPublication(storyId);
    return c.json({ status: "updated" });
  });
  app.get("/posts/:id/history", async (c) => {
    const postId = z.string().uuid().parse(c.req.param("id"));
    const scope = `history:${postId}`;
    const after = decodePageCursor(c.req.query("after"), scope);
    const history = await database
      .selectFrom("postRevision")
      .selectAll()
      .where("postId", "=", postId)
      .$if(Boolean(after), (q) =>
        q.where((eb) =>
          eb.or([
            eb("createdAt", ">", new Date(after?.createdAt ?? "")),
            eb.and([
              eb("createdAt", "=", new Date(after?.createdAt ?? "")),
              eb("id", ">", after?.id ?? ""),
            ]),
          ]),
        ),
      )
      .orderBy("createdAt")
      .orderBy("id")
      .limit(51)
      .execute();
    return c.json({
      revisions: history.slice(0, 50),
      nextCursor: history.length > 50 ? pageCursor(history[49], scope) : null,
    });
  });
  return app;
}
