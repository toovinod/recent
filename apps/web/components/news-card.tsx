import type { FeedCard } from "@recent/contracts";
import Link from "next/link";
import { ArrowIcon } from "./landing/primitives";

export function NewsCard({ card }: { card: FeedCard }) {
  return (
    <article className="grid gap-6 border-t border-ink/15 px-1 py-9 md:grid-cols-[minmax(0,1fr)_minmax(280px,.75fr)] md:gap-14 md:py-12">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#655bbb]">
          <span className="capitalize">{card.format}</span>
          {card.role === "update" && <span>Story update</span>}
          <time dateTime={card.publishedAt} className="text-muted">
            {new Date(card.publishedAt).toLocaleString("en", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </div>
        <h2 className="mt-4 max-w-[630px] text-[clamp(28px,3vw,42px)] leading-[1.12] font-medium tracking-[-.055em]">
          <Link
            href={`/stories/${card.storyId}`}
            className="transition hover:text-[#655bbb] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink"
          >
            {card.headline}
          </Link>
        </h2>
      </div>
      <div className="flex flex-col items-start justify-between gap-7">
        <div>
          <p className="max-w-[480px] whitespace-pre-wrap text-[15px] leading-7 text-[#5e6069]">
            {card.body}
          </p>
          <p className="mt-5 text-[13px] font-medium text-ink/75">From {card.attribution}</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[13px] font-semibold">
          <Link
            href={`/stories/${card.storyId}`}
            className="inline-flex items-center gap-2 transition hover:gap-3 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink"
          >
            Read the story <ArrowIcon className="size-4" />
          </Link>
          <a
            href={card.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#655bbb] transition hover:gap-3 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink"
          >
            Original source <ArrowIcon className="size-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
