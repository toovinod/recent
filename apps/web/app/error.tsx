"use client";

import { AppShell } from "../components/app-shell";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <AppShell headerAction="none">
      <main className="mx-auto w-full max-w-[1200px] px-6 py-20 md:px-10">
        <h1 className="text-2xl font-semibold">Recent is temporarily unavailable</h1>
        <p className="mt-4 text-muted">Please try again in a moment.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Try again
        </button>
      </main>
    </AppShell>
  );
}
