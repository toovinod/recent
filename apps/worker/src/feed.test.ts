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

test("feeds skip missing and Atom self links and reject entity declarations", () => {
  expect(
    parseFeed(
      `<rss><channel><item><title>Missing URL</title></item></channel></rss>`,
      "https://example.com/feed",
    ),
  ).toHaveLength(0);
  expect(
    parseFeed(
      `<feed><entry><title>Self only</title><link rel="self" href="https://example.com/entry.atom"/></entry></feed>`,
      "https://example.com/feed",
    ),
  ).toHaveLength(0);
  expect(() =>
    parseFeed(`<!DOCTYPE feed [<!ENTITY payload "unsafe">]><feed/>`, "https://example.com/feed"),
  ).toThrow("declarations");
});

test("RSS content and author fallbacks preserve source attribution", () => {
  const [item] = parseFeed(
    `<rss><channel><item><title>Release</title><link>https://example.com/release</link><content:encoded><![CDATA[<p>Original content</p>]]></content:encoded><author>Ada</author></item></channel></rss>`,
    "https://example.com/feed",
  );
  expect(item?.excerpt).toBe("Original content");
  expect(item?.authorName).toBe("Ada");
});
