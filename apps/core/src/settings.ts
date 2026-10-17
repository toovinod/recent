import { z } from "zod";

type Environment = Record<string, string | undefined>;

export function loadConfig(env: Environment) {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const production = env.NODE_ENV === "production";
  const origin = (name: string, fallback: string) => {
    const value = production ? required(name) : env[name]?.trim() || fallback;
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(`${name} must be an HTTP origin`);
    if (production && url.protocol !== "https:")
      throw new Error(`${name} must use HTTPS in production`);
    return url.origin;
  };
  const connection = (name: string, protocols: string[]) => {
    const value = required(name);
    if (!protocols.includes(new URL(value).protocol))
      throw new Error(`${name} has an unsupported protocol`);
    return value;
  };
  const oauth = (prefix: string) => {
    const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
    const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
    if (Boolean(clientId) !== Boolean(clientSecret))
      throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be set together`);
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  };
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  return {
    production,
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? "4000"),
    databaseUrl: connection("DATABASE_URL", ["postgres:", "postgresql:"]),
    cacheRedisUrl: connection("CACHE_REDIS_URL", ["redis:", "rediss:"]),
    authSecret: secret,
    authUrl: origin("BETTER_AUTH_URL", "http://localhost:4000"),
    webOrigin: origin("WEB_ORIGIN", "http://localhost:3000"),
    resendApiKey: required("RESEND_API_KEY"),
    emailFrom: required("EMAIL_FROM"),
    cookieDomain: env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
    adminUserIds: new Set(
      (env.ADMIN_USER_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
    google: oauth("GOOGLE"),
    twitter: oauth("TWITTER"),
  };
}
