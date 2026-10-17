import { readdir } from "node:fs/promises";
import { type Migration, type MigrationProvider, Migrator } from "kysely/migration";
import { createDatabase } from "./client";

class BunMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    const directory = new URL("./migrations/", import.meta.url);
    const migrations: Record<string, Migration> = {};

    for (const file of (await readdir(directory)).filter((name) => name.endsWith(".ts"))) {
      migrations[file.slice(0, -3)] = (await import(new URL(file, directory).href)) as Migration;
    }

    return migrations;
  }
}

const db = createDatabase(process.env.DATABASE_URL ?? "", { statementTimeoutMs: 0 });

try {
  const { error, results } = await new Migrator({
    db,
    provider: new BunMigrationProvider(),
  }).migrateToLatest();

  for (const result of results ?? []) {
    console.info(`${result.migrationName}: ${result.status}`);
  }
  if (error) throw error;
} finally {
  await db.destroy();
}
