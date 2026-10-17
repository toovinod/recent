import type { AppDatabase } from "@recent/db";
import { sql } from "kysely";

export async function storyCandidates(database: AppDatabase, title: string) {
  const started = performance.now();
  const candidates = await database.transaction().execute(async (transaction) => {
    await sql`select set_config('pg_trgm.similarity_threshold', '0.25', true)`.execute(transaction);
    return transaction
      .selectFrom("story")
      .select(["id", "title"])
      .where("status", "=", "active")
      .where("updatedAt", ">", new Date(Date.now() - 30 * 86_400_000))
      .where(sql<boolean>`title % ${title}`)
      .orderBy(sql`similarity(title, ${title})`, "desc")
      .orderBy("id")
      .limit(5)
      .execute();
  });
  console.info(
    JSON.stringify({
      metric: "story_candidate_lookup",
      durationMs: Math.round(performance.now() - started),
      candidates: candidates.length,
    }),
  );
  return candidates;
}
