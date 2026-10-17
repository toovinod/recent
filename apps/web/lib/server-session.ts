import "server-only";
import { headers } from "next/headers";
import { fetchFromCore } from "./core-request";

interface SessionResponse {
  user: { id: string; email: string };
}

export async function getServerSession(): Promise<SessionResponse | null> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;

  const response = await fetchFromCore("/api/auth/get-session", cookie);
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to verify your session");
  const data: unknown = await response.json();
  if (data === null) return null;
  if (!data || typeof data !== "object" || !("user" in data))
    throw new Error("Invalid session response");
  const user = data.user;
  if (
    !user ||
    typeof user !== "object" ||
    !("id" in user) ||
    typeof user.id !== "string" ||
    !("email" in user) ||
    typeof user.email !== "string"
  )
    throw new Error("Invalid session response");
  return { user: { id: user.id, email: user.email } };
}
