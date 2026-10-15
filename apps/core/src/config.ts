function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function origin(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return url.origin;
}

function oauthCredentials(prefix: string) {
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must be set together`);
  }
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  cacheRedisUrl: required("CACHE_REDIS_URL"),
  authSecret: required("BETTER_AUTH_SECRET"),
  authUrl: origin("BETTER_AUTH_URL", "http://localhost:4000"),
  webOrigin: origin("WEB_ORIGIN", "http://localhost:3000"),
  resendApiKey: required("RESEND_API_KEY"),
  emailFrom: required("EMAIL_FROM"),
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
  google: oauthCredentials("GOOGLE"),
  twitter: oauthCredentials("TWITTER"),
};

if (config.authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
}
