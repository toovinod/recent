import { z } from "zod";

export const cardFormatSchema = z.enum([
  "report",
  "opinion",
  "guide",
  "demonstration",
  "analysis",
  "incident",
  "correction",
]);

export const feedCardSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  role: z.enum(["main", "update"]),
  format: cardFormatSchema,
  headline: z.string(),
  body: z.string(),
  attribution: z.string(),
  sourceUrl: z.url(),
  sourcePublishedAt: z.iso.datetime({ offset: true }).nullable(),
  publishedAt: z.iso.datetime({ offset: true }),
});

export const feedPageSchema = z.object({
  cards: z.array(feedCardSchema),
  nextCursor: z.string().nullable(),
});

export const storyPageSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  nextCursor: z.string().nullable(),
  cards: z.array(feedCardSchema),
});

export type FeedCard = z.infer<typeof feedCardSchema>;
export type FeedPage = z.infer<typeof feedPageSchema>;
export type StoryPage = z.infer<typeof storyPageSchema>;
