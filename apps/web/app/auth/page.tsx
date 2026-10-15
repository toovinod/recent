import { redirect } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { getServerSession } from "../../lib/server-session";
import { AuthForm } from "./auth-form";

export default async function AuthPage() {
  if (await getServerSession()) redirect("/news");

  return (
    <AppShell headerAction="none">
      <main className="mx-auto flex w-full max-w-[624px] flex-1 flex-col justify-center px-6 py-10 sm:px-8 md:py-12">
        <div className="text-center">
          <h1 className="text-[clamp(36px,4vw,44px)] leading-[1.08] font-medium tracking-[-.06em]">
            Welcome to Recent
          </h1>
        </div>
        <div className="mt-6">
          <AuthForm />
        </div>
      </main>
    </AppShell>
  );
}
