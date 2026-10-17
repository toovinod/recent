import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("pipelineTask")
    .addColumn("nextAttemptAt", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("pipeline_recovery_idx")
    .on("pipelineTask")
    .columns(["nextAttemptAt", "updatedAt"])
    .where(sql<boolean>`status in ('pending', 'processing')`)
    .execute();
  for (const column of ["paginationToken", "crawlNewestId"]) {
    await db.schema.alterTable("sourceCursor").addColumn(column, "text").execute();
  }
  await db.schema
    .alterTable("sourceItem")
    .addColumn("availability", "text", (c) => c.notNull().defaultTo("active"))
    .execute();
  await db.schema.alterTable("sourceItem").addColumn("xCheckedAt", "timestamptz").execute();
  await db.schema
    .createIndex("source_item_x_recheck_idx")
    .on("sourceItem")
    .columns(["xCheckedAt", "id"])
    .where(sql<boolean>`"externalId" is not null and "availability" = 'active'`)
    .execute();
  await db.schema.alterTable("source").addColumn("expiresAt", "timestamptz").execute();
  await sql`alter table "source" drop constraint source_kind_check`.execute(db);
  await sql`alter table "source" add constraint source_kind_check check (kind in ('rss','atom','x','x_search'))`.execute(
    db,
  );
  await db.schema
    .createIndex("story_item_owner_idx")
    .on("storyItem")
    .column("sourceItemId")
    .unique()
    .execute();
  for (const column of ["resolvedBy", "resolutionReason"]) {
    await db.schema.alterTable("reviewItem").addColumn(column, "text").execute();
  }
  await db.schema.alterTable("reviewItem").addColumn("resolvedAt", "timestamptz").execute();
  await db.schema
    .createIndex("review_open_idx")
    .on("reviewItem")
    .columns(["status", "createdAt", "id"])
    .execute();
  await db.schema
    .createTable("postRevision")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("postId", "text", (c) => c.notNull().references("post.id"))
    .addColumn("action", "text", (c) => c.notNull())
    .addColumn("headline", "text", (c) => c.notNull())
    .addColumn("body", "text", (c) => c.notNull())
    .addColumn("attribution", "text", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("actorId", "text", (c) => c.notNull())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("createdAt", "timestamptz", (c) => c.notNull())
    .execute();
  await sql`insert into "postRevision" (id, "postId", action, headline, body, attribution, status, "actorId", reason, "createdAt") select id, id, 'publish', headline, body, attribution, status, 'system', 'Initial publication', "publishedAt" from post`.execute(
    db,
  );
  await db.schema
    .createIndex("post_revision_history_idx")
    .on("postRevision")
    .columns(["postId", "createdAt", "id"])
    .execute();
  await db.schema
    .createTable("editorialAction")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("action", "text", (c) => c.notNull())
    .addColumn("aggregateId", "text", (c) => c.notNull())
    .addColumn("actorId", "text", (c) => c.notNull())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("createdAt", "timestamptz", (c) => c.notNull())
    .execute();
  await db.schema
    .createTable("modelBudget")
    .addColumn("month", "text", (c) => c.primaryKey())
    .addColumn("reservedUsd", "double precision", (c) => c.notNull().defaultTo(0))
    .addColumn("requests", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
  await db.schema
    .createTable("modelUsage")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("sourceItemId", "text", (c) => c.notNull().references("sourceItem.id"))
    .addColumn("provider", "text", (c) => c.notNull())
    .addColumn("purpose", "text", (c) => c.notNull())
    .addColumn("reservedUsd", "double precision", (c) => c.notNull())
    .addColumn("inputTokens", "integer")
    .addColumn("outputTokens", "integer")
    .addColumn("requestId", "text")
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("durationMs", "integer")
    .addColumn("createdAt", "timestamptz", (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex("model_usage_month_idx")
    .on("modelUsage")
    .columns(["createdAt", "provider"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["modelUsage", "modelBudget", "editorialAction", "postRevision"])
    await db.schema.dropTable(table).execute();
  await db.schema.dropIndex("review_open_idx").execute();
  for (const column of ["resolvedAt", "resolvedBy", "resolutionReason"])
    await db.schema.alterTable("reviewItem").dropColumn(column).execute();
  await db.schema.dropIndex("story_item_owner_idx").execute();
  await sql`alter table "source" drop constraint source_kind_check`.execute(db);
  await sql`alter table "source" add constraint source_kind_check check (kind in ('rss','atom','x'))`.execute(
    db,
  );
  await db.schema.alterTable("source").dropColumn("expiresAt").execute();
  await db.schema.dropIndex("source_item_x_recheck_idx").execute();
  for (const column of ["availability", "xCheckedAt"])
    await db.schema.alterTable("sourceItem").dropColumn(column).execute();
  for (const column of ["paginationToken", "crawlNewestId"])
    await db.schema.alterTable("sourceCursor").dropColumn(column).execute();
  await db.schema.dropIndex("pipeline_recovery_idx").execute();
  await db.schema.alterTable("pipelineTask").dropColumn("nextAttemptAt").execute();
}
