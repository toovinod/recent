"use client";

import { type FeedCard, type FeedPage, feedPageSchema } from "@recent/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { NewsCard } from "../../components/news-card";

export function NewsFeed({ initialPage }: { initialPage: FeedPage }) {
  const [cards, setCards] = useState(initialPage.cards);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000"}/api/feed?cursor=${encodeURIComponent(nextCursor)}`,
        {
          credentials: "include",
        },
      );
      if (response.status === 401) {
        window.location.assign("/auth");
        return;
      }
      if (!response.ok) throw new Error("Unable to load more news");
      const page = feedPageSchema.parse(await response.json());
      setCards((current: FeedCard[]) => {
        const seen = new Set(current.map((card) => card.id));
        return [...current, ...page.cards.filter((card) => !seen.has(card.id))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setError("Could not load more news. Please try again.");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, error, loadMore]);

  return (
    <>
      {cards.length === 0 && <p>No stories have been published yet.</p>}
      <div className="news-list">
        {cards.map((card) => (
          <NewsCard key={card.id} card={card} />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
      {isLoading && <p role="status">Loading more news...</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => void loadMore()}>
            Retry
          </button>
        </p>
      )}
      {!nextCursor && cards.length > 0 && <p>You're caught up.</p>}
    </>
  );
}
