import { type AuthClient, createAuthClient } from "@recent/auth/client";

export const authClient: AuthClient = createAuthClient(
  process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000",
);
