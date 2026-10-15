import "server-only";
import { headers } from "next/headers";

interface SessionResponse {
  user: { id: string; email: string };
}

export async function getServerSession(): Promise<SessionResponse | null> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;

  try {
    const response = await fetch(
      `${process.env.CORE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000"}/api/auth/get-session`,
      { headers: { cookie }, cache: "no-store" },
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("user" in data)) return null;
    const user = data.user;
    if (
      !user ||
      typeof user !== "object" ||
      !("id" in user) ||
      typeof user.id !== "string" ||
      !("email" in user) ||
      typeof user.email !== "string"
    ) {
      return null;
    }
    return { user: { id: user.id, email: user.email } };
  } catch {
    return null;
  }
}
