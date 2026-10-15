import { expect, test } from "bun:test";
import { parseFeed } from "./feed";

test("Atom entries preserve source identity and normalize tracking URLs", () => {
  const items = parseFeed(
    `<feed><entry><id>tag:release:1</id><title>Model &amp; API release</title><link rel="alternate" href="https://example.com/release?utm_source=feed#section"/><summary>&lt;p&gt;Original announcement.&lt;/p&gt;</summary><published>2026-10-07T12:00:00Z</published><author><name>Ada</name></author></entry></feed>`,
    "https://example.com/feed.atom",
  );
  expect(items).toHaveLength(1);
  expect(items[0]?.canonicalUrl).toBe("https://example.com/release");
  expect(items[0]?.excerpt).toBe("Original announcement.");
  expect(items[0]?.externalId).toBe("tag:release:1");
  expect(items[0]?.authorName).toBe("Ada");
});

test("RSS rejects unsafe links", () => {
  const items = parseFeed(
    `<rss><channel><item><title>Release</title><link>javascript:alert(1)</link></item></channel></rss>`,
    "https://example.com/feed.xml",
  );
  expect(items).toHaveLength(0);
});
