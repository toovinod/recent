import Link from "next/link";
import { FooterWordmark } from "./footer-wordmark";
import { ArrowIcon, Brand } from "./primitives";

export function LandingHeader() {
  return (
    <header className="border-b border-ink/10 bg-[#f2f0eb] text-ink">
      <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-6 md:px-10">
        <Brand />
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-9 text-[13px] text-ink/60 md:flex"
        >
          <a className="transition hover:text-ink" href="#how-it-works">
            How it works
          </a>
          <a className="transition hover:text-ink" href="#story-preview">
            Original posts
          </a>
          <a className="transition hover:text-ink" href="#featured-thread">
            Story and reactions
          </a>
        </nav>
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
      <div className="mx-auto grid max-w-[1440px] gap-16 px-6 pt-20 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:px-10 md:pt-25">
        <div>
          <Brand />
          <p className="mt-6 max-w-[390px] text-[15px] leading-7 text-muted">
            Recent groups technology updates into short story threads. Original posts and attributed
            reactions stay linked to the story.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-8 text-[13px] sm:gap-12"
        >
          <div className="flex flex-col items-start gap-4">
            <span className="mb-1 font-medium text-ink/45">Explore</span>
            <a href="#how-it-works" className="transition hover:text-[#655bbb]">
              How it works
            </a>
            <a href="#story-preview" className="transition hover:text-[#655bbb]">
              Original posts
            </a>
            <a href="#featured-thread" className="transition hover:text-[#655bbb]">
              Story and reactions
            </a>
          </div>
          <div className="flex flex-col items-start gap-4">
            <span className="mb-1 font-medium text-ink/45">Project</span>
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
        </nav>
      </div>
      <div className="mx-auto mt-20 max-w-[1440px] border-t border-ink/10 px-6 pt-5 text-[11px] text-muted md:px-10">
        © {new Date().getFullYear()} Recent
      </div>
      <FooterWordmark />
    </footer>
  );
}
