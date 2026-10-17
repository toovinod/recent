import {
  APIConnectionError,
  APIError,
  type Questions,
  type SystemOneRequest,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import { ProviderError, retryAfter } from "./provider";

let cached: { key: string; client: TypeSafeClient } | undefined;

export async function requestTypeSafe<Q extends Questions>(
  apiKey: string,
  request: SystemOneRequest<Q>,
): Promise<Response> {
  if (cached?.key !== apiKey) {
    cached = {
      key: apiKey,
      client: new TypeSafeClient({
        apiKey,
        baseURL: "https://api.typesafe.ai",
        defaultModel: "jev-latest",
        timeout: 20_000,
        retry: { maxRetries: 0 },
        compression: false,
        logLevel: "off",
        fetch: (input, init) => fetch(input, init),
      }),
    };
  }
  try {
    const { data, response } = await cached.client.systemOne(request).withResponse();
    return Response.json(data, { status: response.status, headers: response.headers });
  } catch (error) {
    if (error instanceof APIError) {
      throw new ProviderError(
        `TypeSafe request failed with status ${error.status}`,
        error.status === 408 || error.status === 429 || error.status >= 500,
        retryAfter(new Response(null, { status: error.status, headers: error.headers })),
      );
    }
    if (error instanceof APIConnectionError)
      throw new ProviderError("TypeSafe connection failed or timed out", true);
    throw error;
  }
}
