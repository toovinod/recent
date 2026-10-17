import { randomUUID } from "node:crypto";
import type { AppDatabase } from "@recent/db";
import { z } from "zod";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

export function retryAfter(response: Response, now = Date.now()): number {
  const milliseconds = response.headers.get("retry-after-ms");
  if (milliseconds !== null && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0)
    return Number(milliseconds);
  const raw = response.headers.get("retry-after");
  const seconds = raw === null ? NaN : Number(raw);
  const date = raw ? Date.parse(raw) : NaN;
  const reset = Number(response.headers.get("x-rate-limit-reset")) * 1000;
  return Math.max(
    0,
    Number.isFinite(seconds)
      ? seconds * 1000
      : Number.isFinite(date)
        ? date - now
        : reset
          ? reset - now
          : 0,
  );
}

export function assertProviderResponse(response: Response, name: string): void {
  if (!response.ok)
    throw new ProviderError(
      `${name} request failed with status ${response.status}`,
      response.status === 408 || response.status === 429 || response.status >= 500,
      retryAfter(response),
    );
}

export async function providerJson(response: Response, name: string): Promise<unknown> {
  assertProviderResponse(response, name);
  return response.json();
}

export function retryDelay(attempt: number, error: unknown): number {
  return Math.max(
    error instanceof ProviderError ? error.retryAfterMs : 0,
    Math.min(300_000, 5000 * 2 ** Math.max(0, attempt - 1)) + Math.floor(Math.random() * 1000),
  );
}

function positive(name: string, fallback?: string): number {
  return z.coerce
    .number()
    .positive()
    .finite()
    .parse(process.env[name] ?? fallback);
}

export async function modelRequest(
  database: AppDatabase,
  sourceItemId: string,
  provider: "jev" | "luna",
  purpose: string,
  request: () => Promise<Response>,
): Promise<unknown> {
  const month = new Date().toISOString().slice(0, 7);
  const reservation = positive(
    provider === "jev" ? "JEV_REQUEST_BUDGET_USD" : "LUNA_REQUEST_BUDGET_USD",
  );
  const budget = positive("MODEL_MONTHLY_BUDGET_USD");
  const requestLimit = z.coerce
    .number()
    .int()
    .positive()
    .parse(process.env.MODEL_MONTHLY_REQUEST_LIMIT ?? "10000");
  const id = randomUUID();
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto("modelBudget")
      .values({ month, requests: 0, reservedUsd: 0 })
      .onConflict((c) => c.column("month").doNothing())
      .execute();
    const current = await transaction
      .selectFrom("modelBudget")
      .selectAll()
      .where("month", "=", month)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (current.reservedUsd + reservation > budget + 1e-9 || current.requests >= requestLimit) {
      const nextMonth = new Date(`${month}-01T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      throw new ProviderError(
        "Monthly model budget exhausted",
        true,
        nextMonth.getTime() - Date.now(),
      );
    }
    await transaction
      .updateTable("modelBudget")
      .set({
        requests: current.requests + 1,
        reservedUsd: current.reservedUsd + reservation,
      })
      .where("month", "=", month)
      .execute();
    await transaction
      .insertInto("modelUsage")
      .values({
        id,
        sourceItemId,
        provider,
        purpose,
        reservedUsd: reservation,
        status: "reserved",
        createdAt: new Date(),
      })
      .execute();
  });
  const started = performance.now();
  try {
    const response = await request();
    const result = await providerJson(response, provider);
    const usage = z
      .object({
        usage: z
          .object({
            input_tokens: z.number().int().nonnegative().optional(),
            output_tokens: z.number().int().nonnegative().optional(),
          })
          .optional(),
      })
      .safeParse(result);
    await database
      .updateTable("modelUsage")
      .set({
        status: "completed",
        inputTokens: usage.success ? (usage.data.usage?.input_tokens ?? null) : null,
        outputTokens: usage.success ? (usage.data.usage?.output_tokens ?? null) : null,
        requestId:
          response.headers.get("x-typesafe-request-id") ?? response.headers.get("x-request-id"),
        durationMs: Math.round(performance.now() - started),
      })
      .where("id", "=", id)
      .execute();
    console.info(
      JSON.stringify({
        metric: "model_request",
        provider,
        purpose,
        durationMs: Math.round(performance.now() - started),
        reservedUsd: reservation,
      }),
    );
    return result;
  } catch (error) {
    await database
      .updateTable("modelUsage")
      .set({
        status: "failed",
        durationMs: Math.round(performance.now() - started),
      })
      .where("id", "=", id)
      .execute();
    throw error;
  }
}
