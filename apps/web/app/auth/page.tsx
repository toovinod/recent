import { redirect } from "next/navigation";
import { getServerSession } from "../../lib/server-session";
import { AuthForm } from "./auth-form";

export default async function AuthPage() {
  if (await getServerSession()) redirect("/news");

  return (
    <main className="auth-shell">
      <h1>Welcome to Recent</h1>
      <p>Follow the AI stories that matter.</p>
      <AuthForm />
    </main>
  );
}
