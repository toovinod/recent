import type { FeedCard } from "@recent/contracts";
import Link from "next/link";

export function NewsCard({ card }: { card: FeedCard }) {
  return (
    <article className="news-card">
      <div className="news-card-meta">
        <span>{card.format}</span>
        {card.role === "update" && <span>Story update</span>}
        <time dateTime={card.publishedAt}>
          {new Date(card.publishedAt).toLocaleString("en", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      </div>
      <h2>
        <Link href={`/stories/${card.storyId}`}>{card.headline}</Link>
      </h2>
      <p className="news-card-body">{card.body}</p>
      <p className="news-card-attribution">From {card.attribution}</p>
      <div className="news-card-links">
        <Link href={`/stories/${card.storyId}`}>Open thread</Link>
        <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer">
          Original source
        </a>
      </div>
    </article>
  );
}
