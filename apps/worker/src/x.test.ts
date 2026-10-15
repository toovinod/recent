import { expect, test } from "bun:test";
import { parseXPosts } from "./x";

test("X posts retain original text, source link, and reply reference", () => {
  const posts = parseXPosts(
    {
      data: [
        {
          id: "123456789",
          text: "A short preview",
          note_post: { text: "Full original post about an AI model release." },
          conversation_id: "123456700",
          referenced_posts: [{ id: "123456700", type: "replied_to" }],
          created_at: "2026-10-08T00:00:00Z",
        },
        {
          id: "123456790",
          text: "Reposted text",
          referenced_posts: [{ id: "123456701", type: "retweeted" }],
        },
      ],
    },
    "Original author",
  );
  expect(posts).toHaveLength(1);
  expect(posts[0]?.excerpt).toBe("Full original post about an AI model release.");
  expect(posts[0]?.originalUrl).toBe("https://x.com/i/status/123456789");
  expect(posts[0]?.referencedPostId).toBe("123456700");
  expect(posts[0]?.referenceType).toBe("replied_to");
});
