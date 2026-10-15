import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowIcon, Brand } from "./landing/primitives";

export function AppHeader({ action = "account" }: { action?: "account" | "news" | "none" }) {
  return (
    <header className="border-b border-ink/10 bg-[#f2f0eb]">
      <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-6 md:px-10">
        <Brand />
        {action !== "none" && (
          <Link
            href={action === "account" ? "/account" : "/news"}
            className="inline-flex min-h-10 items-center gap-2.5 text-[13px] font-medium text-ink/70 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            {action === "account" ? "Account" : "Back to news"}
            <ArrowIcon className="size-4" />
          </Link>
        )}
      </div>
    </header>
  );
}

export function AppShell({
  children,
  headerAction = "account",
}: {
  children: ReactNode;
  headerAction?: "account" | "news" | "none";
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f2f0eb] text-ink">
      <AppHeader action={headerAction} />
      {children}
      <footer className="mt-auto border-t border-ink/10 px-6 py-7 md:px-10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>Recent</span>
          <a
            href="https://github.com/toovinod/recent"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-ink"
          >
            Open source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
