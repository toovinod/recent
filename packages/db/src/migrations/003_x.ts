import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "source" drop constraint source_kind_check`.execute(db);
  await sql`alter table "source" add constraint source_kind_check check ("kind" in ('rss', 'atom', 'x'))`.execute(
    db,
  );
  await db.schema.alterTable("sourceCursor").addColumn("sinceId", "text").execute();
  await db.schema.alterTable("sourceItem").addColumn("conversationId", "text").execute();
  await db.schema.alterTable("sourceItem").addColumn("referencedPostId", "text").execute();
  await db.schema.alterTable("sourceItem").addColumn("referenceType", "text").execute();
  await db.schema
    .createTable("xReadBudget")
    .addColumn("month", "text", (column) => column.primaryKey())
    .addColumn("reservedPosts", "integer", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("xReadBudget").execute();
  for (const column of ["referenceType", "referencedPostId", "conversationId"]) {
    await db.schema.alterTable("sourceItem").dropColumn(column).execute();
  }
  await db.schema.alterTable("sourceCursor").dropColumn("sinceId").execute();
  await sql`alter table "source" drop constraint source_kind_check`.execute(db);
  await sql`alter table "source" add constraint source_kind_check check ("kind" in ('rss', 'atom'))`.execute(
    db,
  );
}
