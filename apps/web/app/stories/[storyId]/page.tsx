import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NewsCard } from "../../../components/news-card";
import { getStoryPage } from "../../../lib/feed-api";

export default async function StoryPage({ params }: PageProps<"/stories/[storyId]">) {
  const { storyId } = await params;
  const result = await getStoryPage(storyId);
  if (result.status === "unauthorized") redirect("/auth");
  if (result.status === "missing") notFound();
  return (
    <main className="news-shell">
      <header className="news-header">
        <div>
          <Link href="/news">Back to news</Link>
          <h1>{result.story.title}</h1>
        </div>
        <Link href="/account">Account</Link>
      </header>
      <div className="news-list">
        {result.story.cards.map((card) => (
          <NewsCard key={card.id} card={card} />
        ))}
      </div>
    </main>
  );
}
