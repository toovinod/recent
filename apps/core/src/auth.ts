import { createAuthServer } from "@recent/auth/server";
import { createDatabase } from "@recent/db";
import { createMailer } from "@recent/email";
import { config } from "./config";

export const db = createDatabase(config.databaseUrl);

const mailer = createMailer({
  apiKey: config.resendApiKey,
  from: config.emailFrom,
  idempotencySecret: config.authSecret,
});

export const auth = createAuthServer({
  database: db,
  baseURL: config.authUrl,
  secret: config.authSecret,
  webOrigin: config.webOrigin,
  google: config.google,
  twitter: config.twitter,
  cookieDomain: config.cookieDomain,
  sendOtp: mailer.sendOtp,
});
