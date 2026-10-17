import { expect, test } from "bun:test";
import { parseFeed } from "./feed";
import { uniqueFeedItems } from "./pipeline";

test("collection keeps the first entry for each canonical URL", () => {
  const entries = parseFeed(
    `<rss><channel>
      <item><title>Original announcement</title><link>https://example.com/story?utm_source=feed</link></item>
      <item><title>Repeated entry</title><link>https://example.com/story</link></item>
      <item><title>Another story</title><link>https://example.com/other</link></item>
    </channel></rss>`,
    "https://example.com/feed.xml",
  );

  const unique = uniqueFeedItems(entries);
  expect(unique.map((item) => item.title)).toEqual(["Original announcement", "Another story"]);
});

test("collection deduplicates stable source IDs when links change", () => {
  const entries = parseFeed(
    `<rss><channel><item><guid>stable-id</guid><title>First</title><link>https://example.com/first</link></item><item><guid>stable-id</guid><title>Changed URL</title><link>https://example.com/second</link></item></channel></rss>`,
    "https://example.com/feed",
  );
  expect(uniqueFeedItems(entries).map((item) => item.title)).toEqual(["First"]);
});
