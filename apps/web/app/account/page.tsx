import { redirect } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { getServerSession } from "../../lib/server-session";
import { AccountActions } from "./account-actions";

export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) redirect("/auth");

  return (
    <AppShell headerAction="news">
      <main className="mx-auto grid w-full max-w-[1200px] flex-1 gap-14 px-6 py-16 md:px-10 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:items-start lg:gap-24">
        <div>
          <h1 className="text-[clamp(48px,6vw,80px)] leading-[1.02] font-medium tracking-[-.07em]">
            Your account.
          </h1>
          <p className="mt-7 text-[15px] leading-7 text-[#666772]">
            Signed in as <span className="font-medium text-ink">{session.user.email}</span>
          </p>
        </div>
        <AccountActions />
      </main>
    </AppShell>
  );
}
