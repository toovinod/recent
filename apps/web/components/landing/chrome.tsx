import Link from "next/link";
import { FooterWordmark } from "./footer-wordmark";
import { ArrowIcon, Brand } from "./primitives";

export function LandingHeader() {
  return (
    <header className="border-b border-ink/10 bg-[#f2f0eb] text-ink">
      <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-6 md:px-10">
        <Brand />
        <Link
          href="/auth"
          className="inline-flex min-h-10 items-center gap-3 rounded-lg border border-ink/15 px-3.5 text-xs font-medium transition hover:border-ink/50 hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          Get started <ArrowIcon className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="overflow-hidden border-t border-ink/10 bg-[#efede7] text-ink">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 pt-20 md:grid-cols-[minmax(0,1fr)_auto] md:px-10 md:pt-25">
        <div>
          <Brand />
          <p className="mt-6 max-w-[390px] text-[15px] leading-7 text-muted">
            Recent groups technology updates into short story threads. Original posts and attributed
            reactions stay linked to the story.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 text-[13px] md:items-end">
          <a
            href="https://github.com/toovinod/recent"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-[#655bbb]"
          >
            GitHub source
          </a>
          <a
            href="https://github.com/toovinod/recent/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-[#655bbb]"
          >
            Apache 2.0 license
          </a>
        </div>
      </div>
      <div className="mx-auto mt-20 max-w-[1440px] border-t border-ink/10 px-6 pt-5 text-[11px] text-muted md:px-10">
        © {new Date().getFullYear()} Recent
      </div>
      <FooterWordmark />
    </footer>
  );
}
