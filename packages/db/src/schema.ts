import type { Generated, Selectable } from "kysely";

export interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimitTable {
  id: string;
  key: string;
  count: number;
  lastRequest: string;
}

export interface SourceTable {
  id: string;
  name: string;
  kind: "atom" | "rss" | "x" | "x_search";
  expiresAt: Generated<Date | null>;
  feedUrl: string;
  enabled: boolean;
  pollIntervalSeconds: number;
  nextPollAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SourceCursorTable {
  sourceId: string;
  etag: string | null;
  lastModified: string | null;
  lastSuccessAt: Date | null;
  sinceId: string | null;
  paginationToken: Generated<string | null>;
  crawlNewestId: Generated<string | null>;
}

interface SourceItemRecord {
  id: string;
  sourceId: string;
  externalId: string | null;
  originalUrl: string;
  canonicalUrl: string;
  title: string;
  authorName: string | null;
  excerpt: string;
  publishedAt: Date | null;
  discoveredAt: Date;
  contentHash: string;
  conversationId: string | null;
  referencedPostId: string | null;
  referenceType: "replied_to" | "quoted" | null;
  availability: Generated<"active" | "unavailable">;
  xCheckedAt: Generated<Date | null>;
}

export interface XReadBudgetTable {
  month: string;
  reservedPosts: number;
}

export type PipelineStage = "classify" | "match" | "publish";
export type TaskStatus = "pending" | "processing" | "completed" | "dead_lettered";

export interface PipelineTaskTable {
  id: string;
  sourceItemId: string;
  stage: PipelineStage;
  nextAttemptAt: Generated<Date>;
  stageVersion: number;
  inputHash: string;
  status: TaskStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboxEventTable {
  id: string;
  kind: "collect" | "task" | "published";
  aggregateId: string;
  createdAt: Date;
  deliveredAt: Date | null;
  claimExpiresAt: Date | null;
}

export type ContentType =
  | "report"
  | "opinion"
  | "guide"
  | "demonstration"
  | "analysis"
  | "incident"
  | "reaction";

export interface ClassificationDecisionTable {
  id: string;
  sourceItemId: string;
  inputHash: string;
  modelVersion: string;
  rubricVersion: number;
  relevant: boolean;
  contentType: ContentType;
  confidence: number;
  createdAt: Date;
}

export interface StoryTable {
  id: string;
  title: string;
  status: "active" | "retracted";
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryItemTable {
  storyId: string;
  sourceItemId: string;
  relationship: "primary" | "corroboration" | "update" | "reaction";
  createdAt: Date;
}

export interface PostTable {
  id: string;
  storyId: string;
  sourceItemId: string;
  role: "main" | "update";
  format: "report" | "opinion" | "guide" | "demonstration" | "analysis" | "incident" | "correction";
  status: "published" | "retracted";
  headline: string;
  body: string;
  attribution: string;
  generationModel: string;
  publishedAt: Date;
}

export interface PostEvidenceTable {
  id: string;
  postId: string;
  sourceItemId: string;
  claimText: string;
  sourceExcerpt: string;
}

export interface CacheGenerationTable {
  key: string;
  generation: number;
  updatedAt: Date;
}

export interface ReviewItemTable {
  id: string;
  sourceItemId: string;
  reason: string;
  status: "open" | "resolved" | "approved" | "rejected";
  resolvedBy: Generated<string | null>;
  resolutionReason: Generated<string | null>;
  resolvedAt: Generated<Date | null>;
  createdAt: Date;
}

export interface PostRevisionTable {
  id: string;
  postId: string;
  action: "publish" | "correct" | "retract";
  headline: string;
  body: string;
  attribution: string;
  status: "published" | "retracted";
  actorId: string;
  reason: string;
  createdAt: Date;
}

export interface EditorialActionTable {
  id: string;
  action: string;
  aggregateId: string;
  actorId: string;
  reason: string;
  createdAt: Date;
}

export interface ModelBudgetTable {
  month: string;
  reservedUsd: number;
  requests: number;
}

export interface ModelUsageTable {
  id: string;
  sourceItemId: string;
  provider: string;
  purpose: string;
  reservedUsd: number;
  inputTokens: Generated<number | null>;
  outputTokens: Generated<number | null>;
  requestId: Generated<string | null>;
  status: "reserved" | "completed" | "failed";
  durationMs: Generated<number | null>;
  createdAt: Date;
}

export interface Database {
  postRevision: PostRevisionTable;
  editorialAction: EditorialActionTable;
  modelBudget: ModelBudgetTable;
  modelUsage: ModelUsageTable;
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  rateLimit: RateLimitTable;
  source: SourceTable;
  sourceCursor: SourceCursorTable;
  sourceItem: SourceItemRecord;
  xReadBudget: XReadBudgetTable;
  pipelineTask: PipelineTaskTable;
  outboxEvent: OutboxEventTable;
  classificationDecision: ClassificationDecisionTable;
  story: StoryTable;
  storyItem: StoryItemTable;
  post: PostTable;
  postEvidence: PostEvidenceTable;
  cacheGeneration: CacheGenerationTable;
  reviewItem: ReviewItemTable;
}

export type SourceItemTable = Selectable<SourceItemRecord>;
