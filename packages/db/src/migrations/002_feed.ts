import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pg_trgm`.execute(db);
  await db.schema
    .createTable("source")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("kind", "text", (column) => column.notNull())
    .addColumn("feedUrl", "text", (column) => column.notNull().unique())
    .addColumn("enabled", "boolean", (column) => column.notNull())
    .addColumn("pollIntervalSeconds", "integer", (column) => column.notNull())
    .addColumn("nextPollAt", "timestamptz", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .addCheckConstraint("source_kind_check", sql`"kind" in ('rss', 'atom')`)
    .addCheckConstraint("source_poll_interval_check", sql`"pollIntervalSeconds" >= 60`)
    .execute();
  await db.schema
    .createIndex("source_due_idx")
    .on("source")
    .columns(["enabled", "nextPollAt"])
    .execute();

  await db.schema
    .createTable("sourceCursor")
    .addColumn("sourceId", "text", (column) =>
      column.primaryKey().references("source.id").onDelete("cascade"),
    )
    .addColumn("etag", "text")
    .addColumn("lastModified", "text")
    .addColumn("lastSuccessAt", "timestamptz")
    .execute();

  await db.schema
    .createTable("sourceItem")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("sourceId", "text", (column) => column.notNull().references("source.id"))
    .addColumn("externalId", "text")
    .addColumn("originalUrl", "text", (column) => column.notNull())
    .addColumn("canonicalUrl", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("authorName", "text")
    .addColumn("excerpt", "text", (column) => column.notNull())
    .addColumn("publishedAt", "timestamptz")
    .addColumn("discoveredAt", "timestamptz", (column) => column.notNull())
    .addColumn("contentHash", "text", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("source_item_url_idx")
    .on("sourceItem")
    .columns(["sourceId", "canonicalUrl"])
    .unique()
    .execute();
  await db.schema
    .createIndex("source_item_external_idx")
    .on("sourceItem")
    .columns(["sourceId", "externalId"])
    .unique()
    .where("externalId", "is not", null)
    .execute();

  await db.schema
    .createTable("pipelineTask")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("sourceItemId", "text", (column) => column.notNull().references("sourceItem.id"))
    .addColumn("stage", "text", (column) => column.notNull())
    .addColumn("stageVersion", "integer", (column) => column.notNull())
    .addColumn("inputHash", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("attemptCount", "integer", (column) => column.notNull())
    .addColumn("lastError", "text")
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .addCheckConstraint(
      "pipeline_task_stage_check",
      sql`"stage" in ('classify', 'match', 'publish')`,
    )
    .addCheckConstraint(
      "pipeline_task_status_check",
      sql`"status" in ('pending', 'processing', 'completed', 'dead_lettered')`,
    )
    .execute();
  await db.schema
    .createIndex("pipeline_task_identity_idx")
    .on("pipelineTask")
    .columns(["sourceItemId", "stage", "stageVersion", "inputHash"])
    .unique()
    .execute();

  await db.schema
    .createTable("outboxEvent")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("kind", "text", (column) => column.notNull())
    .addColumn("aggregateId", "text", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("deliveredAt", "timestamptz")
    .addCheckConstraint("outbox_kind_check", sql`"kind" in ('collect', 'task', 'published')`)
    .execute();
  await db.schema
    .createIndex("outbox_pending_idx")
    .on("outboxEvent")
    .columns(["createdAt", "id"])
    .where(sql<boolean>`"deliveredAt" is null`)
    .execute();

  await db.schema
    .createTable("classificationDecision")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("sourceItemId", "text", (column) => column.notNull().references("sourceItem.id"))
    .addColumn("inputHash", "text", (column) => column.notNull())
    .addColumn("modelVersion", "text", (column) => column.notNull())
    .addColumn("rubricVersion", "integer", (column) => column.notNull())
    .addColumn("relevant", "boolean", (column) => column.notNull())
    .addColumn("contentType", "text", (column) => column.notNull())
    .addColumn("confidence", "double precision", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("classification_item_idx")
    .on("classificationDecision")
    .columns(["sourceItemId", "createdAt"])
    .execute();

  await db.schema
    .createTable("story")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("story_active_idx")
    .on("story")
    .columns(["status", "updatedAt"])
    .execute();
  await sql`create index story_title_trgm_idx on "story" using gin ("title" gin_trgm_ops)`.execute(
    db,
  );

  await db.schema
    .createTable("storyItem")
    .addColumn("storyId", "text", (column) => column.notNull().references("story.id"))
    .addColumn("sourceItemId", "text", (column) => column.notNull().references("sourceItem.id"))
    .addColumn("relationship", "text", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addPrimaryKeyConstraint("story_item_pk", ["storyId", "sourceItemId"])
    .execute();
  await db.schema
    .createIndex("story_item_source_idx")
    .on("storyItem")
    .column("sourceItemId")
    .execute();

  await db.schema
    .createTable("post")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("storyId", "text", (column) => column.notNull().references("story.id"))
    .addColumn("sourceItemId", "text", (column) => column.notNull().references("sourceItem.id"))
    .addColumn("role", "text", (column) => column.notNull())
    .addColumn("format", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("headline", "text", (column) => column.notNull())
    .addColumn("body", "text", (column) => column.notNull())
    .addColumn("attribution", "text", (column) => column.notNull())
    .addColumn("generationModel", "text", (column) => column.notNull())
    .addColumn("publishedAt", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("post_main_idx")
    .on("post")
    .column("storyId")
    .unique()
    .where(sql<boolean>`"role" = 'main'`)
    .execute();
  await db.schema.createIndex("post_item_idx").on("post").column("sourceItemId").unique().execute();
  await db.schema
    .createIndex("post_feed_idx")
    .on("post")
    .columns(["publishedAt", "id"])
    .where(sql<boolean>`"status" = 'published'`)
    .execute();
  await db.schema
    .createIndex("post_thread_idx")
    .on("post")
    .columns(["storyId", "publishedAt", "id"])
    .execute();

  await db.schema
    .createTable("postEvidence")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("postId", "text", (column) =>
      column.notNull().references("post.id").onDelete("cascade"),
    )
    .addColumn("sourceItemId", "text", (column) => column.notNull().references("sourceItem.id"))
    .addColumn("claimText", "text", (column) => column.notNull())
    .addColumn("sourceExcerpt", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("cacheGeneration")
    .addColumn("key", "text", (column) => column.primaryKey())
    .addColumn("generation", "integer", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("reviewItem")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("sourceItemId", "text", (column) => column.notNull().references("sourceItem.id"))
    .addColumn("reason", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "reviewItem",
    "cacheGeneration",
    "postEvidence",
    "post",
    "storyItem",
    "story",
    "classificationDecision",
    "outboxEvent",
    "pipelineTask",
    "sourceItem",
    "sourceCursor",
    "source",
  ]) {
    await db.schema.dropTable(table).execute();
  }
}
