import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  externalId: string | null;
  originalUrl: string;
  canonicalUrl: string;
  title: string;
  authorName: string | null;
  excerpt: string;
  publishedAt: Date | null;
  contentHash: string;
  conversationId: string | null;
  referencedPostId: string | null;
  referenceType: "replied_to" | "quoted" | null;
}

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && "#text" in value) return text(value["#text"]);
  return "";
}

function plainText(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[entity] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalUrl(value: string, feedUrl: string): string | null {
  try {
    const url = new URL(value, feedUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function date(value: unknown): Date | null {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function parseFeed(xml: string, feedUrl: string): FeedItem[] {
  const document = object(parser.parse(xml));
  const rss = object(object(document.rss).channel);
  const atom = object(document.feed);
  const entries = array(rss.item ?? atom.entry).slice(0, 100);
  if (!document.rss && !document.feed) throw new Error("Unsupported feed format");

  return entries.flatMap((raw): FeedItem[] => {
    const entry = object(raw);
    const links = array(entry.link).map(object);
    const atomLink = links.find((link) => link["@_rel"] === "alternate") ?? links[0];
    const originalUrl = text(atomLink?.["@_href"] ?? entry.link);
    const normalizedUrl = canonicalUrl(originalUrl, feedUrl);
    const title = plainText(entry.title).slice(0, 300);
    if (!normalizedUrl || !title) return [];

    const excerpt = plainText(entry.summary ?? entry.description ?? entry.content).slice(0, 4000);
    const author = object(entry.author);
    return [
      {
        externalId: text(entry.guid ?? entry.id) || null,
        originalUrl: new URL(originalUrl, feedUrl).toString(),
        canonicalUrl: normalizedUrl,
        title,
        authorName: plainText(author.name ?? entry["dc:creator"]) || null,
        excerpt,
        publishedAt: date(entry.pubDate ?? entry.published ?? entry.updated),
        contentHash: createHash("sha256").update(`${title}\0${excerpt}`).digest("hex"),
        conversationId: null,
        referencedPostId: null,
        referenceType: null,
      },
    ];
  });
}

export async function fetchFeed(
  feedUrl: string,
  cursor: { etag: string | null; lastModified: string | null },
): Promise<{
  items: FeedItem[];
  etag: string | null;
  lastModified: string | null;
  unchanged: boolean;
}> {
  const headers = new Headers({ "user-agent": "RecentFeedBot/1.0" });
  if (cursor.etag) headers.set("if-none-match", cursor.etag);
  if (cursor.lastModified) headers.set("if-modified-since", cursor.lastModified);
  const response = await fetch(feedUrl, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 304) {
    return {
      items: [],
      etag: cursor.etag,
      lastModified: cursor.lastModified,
      unchanged: true,
    };
  }
  if (!response.ok) throw new Error(`Feed request failed with status ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Feed response has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new Error("Feed exceeds 2 MB limit");
    }
    chunks.push(value);
  }
  const xml = new TextDecoder().decode(Buffer.concat(chunks));
  return {
    items: parseFeed(xml, feedUrl),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    unchanged: false,
  };
}
