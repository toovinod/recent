import { expect, test } from "bun:test";
import { loadConfig } from "./settings";

const env = {
  DATABASE_URL: "postgres://localhost/recent",
  CACHE_REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "a".repeat(32),
  RESEND_API_KEY: "test",
  EMAIL_FROM: "test@example.com",
};
test("production requires explicit HTTPS auth and web origins", () => {
  expect(() => loadConfig({ ...env, NODE_ENV: "production" })).toThrow(
    "BETTER_AUTH_URL is required",
  );
  expect(() =>
    loadConfig({
      ...env,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://api.example.com",
      WEB_ORIGIN: "https://example.com",
    }),
  ).toThrow("HTTPS");
  expect(
    loadConfig({
      ...env,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://api.example.com",
      WEB_ORIGIN: "https://example.com",
    }).authUrl,
  ).toBe("https://api.example.com");
});
test("malformed ports, connection schemes, and credential-bearing origins are rejected", () => {
  expect(() => loadConfig({ ...env, PORT: "4000junk" })).toThrow();
  expect(() => loadConfig({ ...env, DATABASE_URL: "https://db.example.com" })).toThrow("protocol");
  expect(() => loadConfig({ ...env, WEB_ORIGIN: "https://user:secret@example.com" })).toThrow(
    "origin",
  );
});
