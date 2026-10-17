import { afterAll, expect, test } from "bun:test";
import { createDatabase } from "@recent/db";
import { createApp } from "./app";

const database = createDatabase("postgres://localhost/recent_test");
afterAll(() => database.destroy());
function application(userId?: string, fail = false) {
  return createApp({
    database,
    webOrigin: "https://recent.example",
    adminUserIds: new Set(["editor"]),
    cache: { getOrLoad: async (_namespace, _page, load) => load(), invalidate: async () => {} },
    auth: {
      handler: () => Response.json(null),
      session: async () => {
        if (fail) throw new Error("Private connection details");
        return userId ? { user: { id: userId } } : null;
      },
    },
  });
}

test("protected routes deny unauthenticated and non-editor callers", async () => {
  expect((await application().request("/api/feed")).status).toBe(401);
  expect((await application("reader").request("/api/admin/reviews")).status).toBe(403);
  expect(
    (
      await application("editor").request("/api/admin/reviews", {
        headers: { origin: "https://untrusted.example" },
      })
    ).status,
  ).toBe(403);
});

test("responses include correlation, private caching, security, and CORS headers", async () => {
  const response = await application().request("/api/feed", {
    headers: { origin: "https://recent.example", "x-request-id": "fixture-request" },
  });
  expect(response.headers.get("x-request-id")).toBe("fixture-request");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("access-control-allow-origin")).toBe("https://recent.example");
});

test("oversized bodies are rejected with readable CORS errors", async () => {
  const response = await application().request("/api/auth/sign-in/email", {
    method: "POST",
    body: "x".repeat(65 * 1024),
    headers: { origin: "https://recent.example" },
  });
  expect(response.status).toBe(413);
  expect(response.headers.get("access-control-allow-origin")).toBe("https://recent.example");
});

test("backend failures stay service errors without leaking details", async () => {
  const app = application(undefined, true);
  const response = await app.request("/api/feed");
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("Private connection");
  expect((await app.request("/health")).status).toBe(200);
});
