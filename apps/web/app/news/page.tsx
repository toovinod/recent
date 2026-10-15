import { redirect } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { getFeedPage } from "../../lib/feed-api";
import { NewsFeed } from "./feed";

export default async function NewsPage() {
  const page = await getFeedPage();
  if (!page) redirect("/auth");
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pt-16 pb-24 md:px-10 md:pt-24">
        <header className="grid gap-6 pb-16 md:grid-cols-[1fr_360px] md:items-end md:gap-12">
          <h1 className="text-[clamp(54px,7vw,94px)] leading-none font-medium tracking-[-.075em]">
            The news, in context.
          </h1>
          <p className="max-w-[360px] text-[15px] leading-7 text-[#666772]">
            Technology updates and reactions, grouped by story with links to the original posts.
          </p>
        </header>
        <NewsFeed initialPage={page} />
      </main>
    </AppShell>
  );
}
