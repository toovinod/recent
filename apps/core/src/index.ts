import { createApp } from "./app";
import { auth, db } from "./auth";
import { PublishedContentCache } from "./cache";
import { config } from "./config";

const cache = new PublishedContentCache(config.cacheRedisUrl);
export const app = createApp({
  database: db,
  cache,
  auth: {
    handler: (request) => auth.handler(request),
    session: (headers) => auth.api.getSession({ headers }),
  },
  webOrigin: config.webOrigin,
  adminUserIds: config.adminUserIds,
});
const server = Bun.serve({
  development: !config.production,
  port: config.port,
  fetch: app.fetch,
  maxRequestBodySize: 64 * 1024,
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 30_000).unref();
  try {
    await server.stop();
    await Promise.all([db.destroy(), cache.close()]);
    clearTimeout(deadline);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void shutdown();
  });
