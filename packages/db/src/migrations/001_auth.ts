import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("email", "text", (column) => column.notNull().unique())
    .addColumn("emailVerified", "boolean", (column) => column.notNull())
    .addColumn("image", "text")
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("session")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("userId", "text", (column) =>
      column.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("token", "text", (column) => column.notNull().unique())
    .addColumn("expiresAt", "timestamptz", (column) => column.notNull())
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema.createIndex("session_user_id_idx").on("session").column("userId").execute();
  await db.schema.createIndex("session_expires_at_idx").on("session").column("expiresAt").execute();

  await db.schema
    .createTable("account")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("userId", "text", (column) =>
      column.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("accountId", "text", (column) => column.notNull())
    .addColumn("providerId", "text", (column) => column.notNull())
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("idToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("account_provider_account_idx")
    .on("account")
    .columns(["providerId", "accountId"])
    .unique()
    .execute();
  await db.schema.createIndex("account_user_id_idx").on("account").column("userId").execute();

  await db.schema
    .createTable("verification")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("identifier", "text", (column) => column.notNull())
    .addColumn("value", "text", (column) => column.notNull())
    .addColumn("expiresAt", "timestamptz", (column) => column.notNull())
    .addColumn("createdAt", "timestamptz", (column) => column.notNull())
    .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("verification_identifier_idx")
    .on("verification")
    .column("identifier")
    .execute();
  await db.schema
    .createIndex("verification_expires_at_idx")
    .on("verification")
    .column("expiresAt")
    .execute();

  await db.schema
    .createTable("rateLimit")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("key", "text", (column) => column.notNull().unique())
    .addColumn("count", "integer", (column) => column.notNull())
    .addColumn("lastRequest", "bigint", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("rateLimit").execute();
  await db.schema.dropTable("verification").execute();
  await db.schema.dropTable("account").execute();
  await db.schema.dropTable("session").execute();
  await db.schema.dropTable("user").execute();
}
