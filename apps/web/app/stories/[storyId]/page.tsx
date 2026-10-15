import { notFound, redirect } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { NewsCard } from "../../../components/news-card";
import { getStoryPage } from "../../../lib/feed-api";

export default async function StoryPage({ params }: PageProps<"/stories/[storyId]">) {
  const { storyId } = await params;
  const result = await getStoryPage(storyId);
  if (result.status === "unauthorized") redirect("/auth");
  if (result.status === "missing") notFound();
  return (
    <AppShell headerAction="news">
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pt-16 pb-24 md:px-10 md:pt-24">
        <header className="pb-16">
          <p className="mb-6 text-[13px] font-medium text-[#655bbb]">Story</p>
          <h1 className="max-w-[1000px] text-[clamp(48px,6vw,82px)] leading-[1.04] font-medium tracking-[-.07em]">
            {result.story.title}
          </h1>
        </header>
        <div className="border-b border-ink/15">
          {result.story.cards.map((card) => (
            <NewsCard key={card.id} card={card} />
          ))}
        </div>
      </main>
    </AppShell>
  );
}
