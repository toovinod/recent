import { randomUUID } from "node:crypto";
import { type AppDatabase, invalidatePublication } from "@recent/db";
import { withOwnership } from "./ownership";
import { providerJson } from "./provider";
import { parseXPosts, reserveXReadBudget, xResponseSchema } from "./x";

export async function recheckXPosts(
  database: AppDatabase,
  bearerToken: string,
  request: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch,
): Promise<number> {
  return (
    (await withOwnership(database, ["x-recheck"], async (connection) => {
      const items = await connection
        .selectFrom("sourceItem")
        .innerJoin("source", "source.id", "sourceItem.sourceId")
        .selectAll("sourceItem")
        .where("source.kind", "in", ["x", "x_search"])
        .where("sourceItem.availability", "=", "active")
        .where((eb) =>
          eb.or([
            eb("sourceItem.xCheckedAt", "is", null),
            eb("sourceItem.xCheckedAt", "<", new Date(Date.now() - 24 * 3_600_000)),
          ]),
        )
        .orderBy("sourceItem.xCheckedAt", "asc")
        .orderBy("sourceItem.id")
        .limit(5)
        .execute();
      if (!items.length) return 0;
      await reserveXReadBudget(connection, items.length, true);
      const url = new URL("https://api.x.com/2/tweets");
      url.searchParams.set("ids", items.map((item) => item.externalId).join(","));
      url.searchParams.set("post.fields", "created_at,conversation_id,note_post,withheld");
      const payload = xResponseSchema.parse(
        await providerJson(
          await request(url, {
            headers: { authorization: `Bearer ${bearerToken}` },
            signal: AbortSignal.timeout(15_000),
          }),
          "X availability",
        ),
      );
      let checked = 0;
      for (const item of items) {
        const current = payload.data?.find(
          (post) =>
            post.id === item.externalId ||
            post.edit_history_post_ids?.includes(item.externalId ?? ""),
        );
        const missing = payload.errors?.some(
          (error) =>
            (error.resource_id ?? error.value) === item.externalId &&
            (error.title === "Not Found Error" ||
              error.title === "Authorization Error" ||
              error.type?.endsWith("/resource-not-found") ||
              error.type?.endsWith("/not-authorized-for-resource")),
        );
        const normalized = current
          ? parseXPosts({ data: [current] }, item.authorName)[0]
          : undefined;
        if (!current && !missing) continue;
        await withOwnership(connection, [`item:${item.id}`], async (owned) => {
          await owned.transaction().execute(async (transaction) => {
            const changed = Boolean(normalized && normalized.contentHash !== item.contentHash);
            const unavailable = missing || Boolean(current?.withheld);
            if (changed || unavailable) {
              const posts = await transaction
                .selectFrom("post")
                .selectAll()
                .where("sourceItemId", "=", item.id)
                .forUpdate()
                .execute();
              await transaction
                .updateTable("post")
                .set({ status: "retracted", headline: "Source unavailable", body: "" })
                .where("sourceItemId", "=", item.id)
                .execute();
              for (const post of posts) {
                await transaction
                  .updateTable("postRevision")
                  .set({ headline: "Source unavailable", body: "" })
                  .where("postId", "=", post.id)
                  .execute();
                await transaction
                  .insertInto("postRevision")
                  .values({
                    id: randomUUID(),
                    postId: post.id,
                    action: "retract",
                    status: "retracted",
                    headline: "Source unavailable",
                    body: "",
                    attribution: post.attribution,
                    actorId: "system",
                    reason: changed
                      ? "X source edited; editorial review required"
                      : "X source unavailable",
                    createdAt: new Date(),
                  })
                  .execute();
                await transaction
                  .updateTable("story")
                  .set({ title: "Story source changed", updatedAt: new Date() })
                  .where("id", "=", post.storyId)
                  .where("title", "=", item.title)
                  .execute();
                await invalidatePublication(transaction, post.storyId);
              }
              await transaction
                .updateTable("postEvidence")
                .set({ claimText: "", sourceExcerpt: "" })
                .where("sourceItemId", "=", item.id)
                .execute();
              await transaction
                .updateTable("sourceItem")
                .set({
                  availability: unavailable ? "unavailable" : "active",
                  title: changed && normalized ? normalized.title : "Source unavailable",
                  excerpt: changed && normalized ? normalized.excerpt : "",
                  contentHash: changed && normalized ? normalized.contentHash : item.contentHash,
                  xCheckedAt: new Date(),
                })
                .where("id", "=", item.id)
                .execute();
              await transaction
                .updateTable("pipelineTask")
                .set({ status: "completed", updatedAt: new Date() })
                .where("sourceItemId", "=", item.id)
                .where("status", "in", ["pending", "processing"])
                .execute();
              await transaction
                .insertInto("reviewItem")
                .values({
                  id: randomUUID(),
                  sourceItemId: item.id,
                  reason: changed ? "x_source_edited" : "x_source_unavailable",
                  status: "open",
                  createdAt: new Date(),
                })
                .execute();
            } else
              await transaction
                .updateTable("sourceItem")
                .set({ xCheckedAt: new Date() })
                .where("id", "=", item.id)
                .execute();
            checked++;
          });
        });
      }
      console.info(JSON.stringify({ metric: "x_recheck", requested: items.length, checked }));
      return checked;
    })) ?? 0
  );
}
