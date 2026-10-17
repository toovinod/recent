import { afterEach, expect, spyOn, test } from "bun:test";
import { noul } from "@typesafe-ai/sdk";
import { ProviderError } from "./provider";
import { requestTypeSafe } from "./typesafe";

const target: { fetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> } =
  globalThis;
let mock: ReturnType<typeof spyOn<typeof target, "fetch">> | undefined;
afterEach(() => {
  mock?.mockRestore();
});

test("official TypeSafe client sends typed questions and retains usage and request IDs", async () => {
  let body: unknown;
  mock = spyOn(target, "fetch").mockImplementation(async (url, init) => {
    expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-sdk");
    body = JSON.parse(String(init?.body));
    return jsonResponse(
      {
        model: "jev-fixture",
        answers: { relevant: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 5, output_tokens: 1 },
      },
      { headers: { "x-typesafe-request-id": "fixture-request" } },
    );
  });
  const response = await requestTypeSafe("test-sdk", {
    state: { title: "AI release" },
    questions: { relevant: noul("Is it relevant?") },
  });
  expect(body).toMatchObject({ questions: { relevant: { type: "noul" } } });
  expect(response.headers.get("x-typesafe-request-id")).toBe("fixture-request");
  expect(await response.json()).toMatchObject({ usage: { input_tokens: 5 } });
});

test("SDK retries are disabled and rate-limit delays are preserved for the durable queue", async () => {
  let calls = 0;
  mock = spyOn(target, "fetch").mockImplementation(async () => {
    calls++;
    return new Response(null, { status: 429, headers: { "retry-after-ms": "1500" } });
  });
  try {
    await requestTypeSafe("test-sdk", {
      state: "Source",
      questions: { relevant: noul("Relevant?") },
    });
    throw new Error("Expected rate-limit error");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).retryable).toBe(true);
    expect((error as ProviderError).retryAfterMs).toBe(1500);
  }
  expect(calls).toBe(1);
});

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        "content-type": "application/json",
      },
    },
  );
}
