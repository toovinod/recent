import { createDatabase } from "@recent/db";
import { sql } from "kysely";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== "/recent_test" ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
)
  throw new Error("Benchmark requires an isolated local recent_test database");
const db = createDatabase(url);
const rollback = new Error("Benchmark complete");
try {
  await db.transaction().execute(async (transaction) => {
    await sql`insert into story (id, title, status, "createdAt", "updatedAt")
      select 'benchmark-' || n, case when n % 1000 = 0 then 'Acme launches reasoning model R2 version ' || n else
        (array['Research','Security','Policy','Developer','Robotics','Hardware','Funding','Cloud','Open source','Benchmark'])[1 + n % 10] || ' ' ||
        (array['Contoso','Northwind','Fabrikam','Globex','Initech','Umbrella','Hooli','Stark','Wayne','Wonka'])[1 + (n / 10) % 10] || ' update ' || md5(n::text) end,
        'active', now() - (n % 90 || ' days')::interval, now() - (n % 90 || ' days')::interval
      from generate_series(1, 50000) n`.execute(transaction);
    await sql`analyze story`.execute(transaction);
    await sql`select set_config('pg_trgm.similarity_threshold', '0.25', true)`.execute(transaction);
    const title = "Acme launches reasoning model R2";
    for (const variant of ["previous", "indexed"] as const) {
      const predicate =
        variant === "previous" ? sql`similarity(title, ${title}) >= 0.25` : sql`title % ${title}`;
      const result = await sql<{ "QUERY PLAN": unknown }>`explain (analyze, buffers, format json)
        select id, title from story where status = 'active' and "updatedAt" > now() - interval '30 days' and ${predicate}
        order by similarity(title, ${title}) desc limit ${variant === "previous" ? 1 : 5}`.execute(
        transaction,
      );
      console.info(
        JSON.stringify({
          variant,
          dataset: "50000 synthetic stories with mixed topics and 90 days of activity",
          plan: result.rows[0]?.["QUERY PLAN"],
        }),
      );
    }
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.destroy();
}
