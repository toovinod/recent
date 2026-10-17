"use client";

import type { FeedCard } from "@recent/contracts";
import { useEffect, useRef, useState } from "react";
import { NewsCard } from "./news-card";

function CardGroup({ cards }: { cards: FeedCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (!entry.isIntersecting && element.contains(document.activeElement)) return;
        if (!entry.isIntersecting) setHeight(element.getBoundingClientRect().height);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "2000px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} style={visible ? undefined : { height }}>
      {visible ? cards.map((card) => <NewsCard key={card.id} card={card} />) : null}
    </div>
  );
}

export function VirtualCards({ cards }: { cards: FeedCard[] }) {
  const groups = [];
  for (let offset = 0; offset < cards.length; offset += 20) {
    const page = cards.slice(offset, offset + 20);
    groups.push(<CardGroup key={page[0]?.id} cards={page} />);
  }
  return groups;
}
