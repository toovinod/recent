import type { AppDatabase } from "@recent/db";
import { sql } from "kysely";

export const LOCK_NAMESPACE = 72410;

export async function withOwnership<T>(
  database: AppDatabase,
  keys: string[],
  work: (connection: AppDatabase) => Promise<T>,
): Promise<T | undefined> {
  return database.connection().execute(async (connection) => {
    const held: string[] = [];
    try {
      for (const key of keys) {
        const result = await sql<{
          owned: boolean;
        }>`select pg_try_advisory_lock(${LOCK_NAMESPACE}, hashtext(${key})) as owned`.execute(
          connection,
        );
        if (!result.rows[0]?.owned) return undefined;
        held.push(key);
      }
      return await work(connection);
    } finally {
      for (const key of held.reverse())
        await sql`select pg_advisory_unlock(${LOCK_NAMESPACE}, hashtext(${key}))`.execute(
          connection,
        );
    }
  });
}
