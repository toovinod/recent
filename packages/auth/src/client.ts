import { createAuthClient as createBetterAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

type AuthClientOptions = {
  baseURL: string;
  plugins: [ReturnType<typeof emailOTPClient>];
};

export function createAuthClient(
  baseURL: string,
): ReturnType<typeof createBetterAuthClient<AuthClientOptions>> {
  return createBetterAuthClient({
    baseURL,
    plugins: [emailOTPClient()],
  });
}

export type AuthClient = ReturnType<typeof createAuthClient>;
