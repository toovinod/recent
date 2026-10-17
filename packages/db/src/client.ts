import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./schema";

export function createDatabase(
  connectionString: string,
  options: { statementTimeoutMs?: number } = {},
) {
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 10_000,
  });
  pool.on("error", (error) =>
    console.error(
      JSON.stringify({ event: "database_idle_connection_error", errorType: error.name }),
    ),
  );
  return new Kysely<Database>({
    log(event) {
      if (event.level === "query" && event.queryDurationMillis >= 100)
        console.info(
          JSON.stringify({
            metric: "slow_database_query",
            durationMs: Math.round(event.queryDurationMillis),
            operation: event.query.sql.trim().split(/\s+/)[0],
          }),
        );
    },
    dialect: new PostgresDialect({ pool }),
  });
}

export type AppDatabase = ReturnType<typeof createDatabase>;
