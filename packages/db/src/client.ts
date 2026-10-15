import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./schema";

export function createDatabase(connectionString: string) {
  if (!connectionString) throw new Error("DATABASE_URL is required");

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
      }),
    }),
  });
}

export type AppDatabase = ReturnType<typeof createDatabase>;
