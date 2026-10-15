import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "../../lib/server-session";
import { AccountActions } from "./account-actions";

export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) redirect("/auth");

  return (
    <main className="auth-shell">
      <h1>Your account</h1>
      <p>
        <Link href="/news">Back to news</Link>
      </p>
      <p>Signed in as {session.user.email}</p>
      <AccountActions />
    </main>
  );
}
