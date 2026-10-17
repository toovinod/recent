import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("outboxEvent").addColumn("claimExpiresAt", "timestamptz").execute();
  await db.schema
    .createIndex("source_item_external_lookup_idx")
    .on("sourceItem")
    .column("externalId")
    .where(sql<boolean>`"externalId" is not null`)
    .execute();
  await db.schema
    .createIndex("source_item_content_hash_idx")
    .on("sourceItem")
    .column("contentHash")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("source_item_content_hash_idx").execute();
  await db.schema.dropIndex("source_item_external_lookup_idx").execute();
  await db.schema.alterTable("outboxEvent").dropColumn("claimExpiresAt").execute();
}
