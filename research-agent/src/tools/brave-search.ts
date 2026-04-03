import { Effect } from "effect";
import { tool } from "langchain";
import { z } from "zod";

import { loadConfig } from "../config.js";
import type { SourceTracker } from "../core/source-tracker.js";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  language?: string;
  age?: string;
  extra_snippets?: string[];
};

type BraveSearchResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

type BraveSearchInput = {
  query: string;
  maxResults?: number;
  country?: string;
  searchLang?: string;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function requireBraveApiKey(): string {
  const config = loadConfig();
  if (!config.braveSearchApiKey) {
    throw new Error(
      "Missing BRAVE_SEARCH_API_KEY. Set it in .env or the environment before running the research agent.",
    );
  }
  return config.braveSearchApiKey;
}

function buildSearchParams(args: {
  query: string;
  maxResults: number;
  country: string;
  searchLang: string;
}) {
  return new URLSearchParams({
    q: args.query,
    count: String(args.maxResults),
    country: args.country,
    search_lang: args.searchLang,
  });
}

async function requestBraveSearch(url: string, apiKey: string) {
  return Effect.runPromise(
    Effect.tryPromise({
      try: () =>
        fetchWithTimeout(
          url,
          {
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              "X-Subscription-Token": apiKey,
            },
          },
          15_000,
        ),
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
    }),
  );
}

async function ensureSearchResponse(
  response: Response,
  attempt: number,
): Promise<Response | null> {
  if (response.status === 429 && attempt < 3) {
    await sleep(500 * attempt);
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Brave Search API request failed with ${response.status} ${response.statusText}: ${body}`,
    );
  }

  return response;
}

function normalizeResults(data: BraveSearchResponse, maxResults: number) {
  return (data.web?.results ?? [])
    .slice(0, maxResults)
    .map((result, index) => ({
      rank: index + 1,
      title: result.title ?? "Untitled result",
      url: result.url ?? "",
      description: result.description ?? "",
      language: result.language ?? null,
      age: result.age ?? null,
      extraSnippets: result.extra_snippets ?? [],
    }))
    .filter((result) => Boolean(result.url));
}

function recordSearchResults(
  sourceTracker: SourceTracker,
  query: string,
  results: ReturnType<typeof normalizeResults>,
) {
  sourceTracker.recordSearch({
    query,
    observedAt: new Date().toISOString(),
    results: results.map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description,
      language: result.language,
      age: result.age,
    })),
  });
}

export function createBraveSearchTool(sourceTracker: SourceTracker) {
  const schema = z.object({
    query: z.string().describe("The web search query."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(8)
      .describe("Maximum number of web results to return."),
    country: z
      .string()
      .optional()
      .default("us")
      .describe("Country code for localized ranking, such as 'us' or 'gb'."),
    searchLang: z
      .string()
      .optional()
      .default("en")
      .describe("Search language, such as 'en'."),
  });

  return tool(
    async ({
      query,
      maxResults = 8,
      country = "us",
      searchLang = "en",
    }: BraveSearchInput) => {
      const apiKey = requireBraveApiKey();
      const params = buildSearchParams({
        query,
        maxResults,
        country,
        searchLang,
      });

      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const rawResponse = await requestBraveSearch(
            `${BRAVE_SEARCH_ENDPOINT}?${params.toString()}`,
            apiKey,
          );
          const response = await ensureSearchResponse(rawResponse, attempt);
          if (!response) {
            continue;
          }

          const data = (await response.json()) as BraveSearchResponse;
          const results = normalizeResults(data, maxResults);
          recordSearchResults(sourceTracker, query, results);

          return JSON.stringify(
            {
              query,
              resultCount: results.length,
              results,
            },
            null,
            2,
          );
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await sleep(300 * attempt);
          }
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
    },
    {
      name: "brave_search",
      description:
        "Search the public web with Brave Search. Use this to find current sources, official pages, news, and supporting evidence for a research task.",
      schema: schema as never,
    },
  );
}
