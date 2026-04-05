import { Effect } from "effect";
import { tool } from "langchain";
import z from "zod/v3";

import type { SourceTracker } from "../core/source-tracker.js";

const fetchUrlSchema = z.object({
  url: z.string().url().describe("The URL to fetch."),
  maxChars: z
    .number()
    .int()
    .min(500)
    .max(30000)
    .optional()
    .default(12000)
    .describe("Maximum characters to return from the fetched document."),
});

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match?.[1]?.trim();
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        Accept:
          "text/html,application/json,text/plain,application/pdf;q=0.9,*/*;q=0.8",
        "User-Agent": "research-agent/0.1",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createFetchUrlTool(sourceTracker: SourceTracker) {
  return tool(
    (input: { url: string; maxChars?: number }) =>
      runFetchUrl(sourceTracker, input),
    {
      name: "fetch_url",
      description:
        "Fetch and extract a web page or document by URL. Use this after source discovery to inspect the actual page content, title, and basic metadata.",
      schema: fetchUrlSchema as never,
    },
  );
}

async function runFetchUrl(
  sourceTracker: SourceTracker,
  { url, maxChars = 12000 }: { url: string; maxChars?: number },
) {
  const response = await Effect.runPromise(
    Effect.tryPromise({
      try: () => fetchWithTimeout(url, 15_000),
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
    }),
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText} ${body}`,
    );
  }

  const contentType = response.headers.get("content-type");
  const lastModified = response.headers.get("last-modified");
  const raw = await response.text();
  const isHtml = contentType?.includes("html") ?? false;
  const title = isHtml ? extractTitle(raw) : undefined;
  const normalizedText = isHtml ? stripHtml(raw) : raw.trim();
  const excerpt = normalizedText.slice(0, maxChars);

  sourceTracker.recordFetch({
    url,
    observedAt: new Date().toISOString(),
    contentType,
    title,
    lastModified,
  });

  return JSON.stringify(
    {
      url,
      finalUrl: response.url,
      contentType,
      lastModified,
      title,
      excerpt,
    },
    null,
    2,
  );
}
