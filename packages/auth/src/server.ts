import type { AppDatabase } from "@recent/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";

export type OtpPurpose = "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface AuthServerOptions {
  database: AppDatabase;
  baseURL: string;
  secret: string;
  webOrigin: string;
  google?: { clientId: string; clientSecret: string };
  twitter?: { clientId: string; clientSecret: string };
  cookieDomain?: string;
  sendOtp: (email: string, otp: string, purpose: OtpPurpose) => Promise<void>;
}

export function createAuthServer(options: AuthServerOptions) {
  const authOptions: BetterAuthOptions = {
    appName: "Recent",
    baseURL: options.baseURL,
    secret: options.secret,
    database: { db: options.database, type: "postgres" },
    trustedOrigins: [options.webOrigin],
    ...(options.cookieDomain
      ? { advanced: { crossSubDomainCookies: { enabled: true, domain: options.cookieDomain } } }
      : {}),
    account: {
      encryptOAuthTokens: true,
      accountLinking: { trustedProviders: ["google"] },
    },
    verification: { storeIdentifier: "hashed" },
    rateLimit: { enabled: true, storage: "database" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: {
      ...(options.google ? { google: options.google } : {}),
      ...(options.twitter
        ? {
            twitter: {
              ...options.twitter,
              scope: ["tweet.read", "users.read", "user.email"],
            },
          }
        : {}),
    },
    plugins: [
      emailOTP({
        otpLength: 8,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          await options.sendOtp(email, otp, type);
        },
      }),
    ],
  };

  return betterAuth(authOptions);
}
