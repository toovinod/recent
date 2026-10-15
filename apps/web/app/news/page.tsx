import Link from "next/link";
import { redirect } from "next/navigation";
import { getFeedPage } from "../../lib/feed-api";
import { NewsFeed } from "./feed";

export default async function NewsPage() {
  const page = await getFeedPage();
  if (!page) redirect("/auth");
  return (
    <main className="news-shell">
      <header className="news-header">
        <div>
          <p className="news-eyebrow">Recent</p>
          <h1>News</h1>
          <p>AI developments, with the source attached.</p>
        </div>
        <Link href="/account">Account</Link>
      </header>
      <NewsFeed initialPage={page} />
    </main>
  );
}
