import type {
  ClaimLedgerRecord,
  FetchObservation,
  FreshnessAssessment,
  ProvenanceManifest,
  SearchObservation,
  SourceRecord,
  SourceType,
} from "./types.js";

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function domainFromUrl(url: string): string {
  return safeUrl(url)?.hostname ?? "unknown";
}

const OFFICIAL_SUFFIXES = [
  ".gov",
  ".mil",
  ".edu",
  ".gouv.fr",
  ".gov.uk",
  ".europa.eu",
];

const REFERENCE_MARKERS = [
  "docs.",
  "developer.",
  "api.",
  "standards",
  "spec",
  "ietf",
  "w3.org",
];

const NEWS_MARKERS = [
  "news",
  "reuters",
  "bloomberg",
  "ft.com",
  "wsj.com",
  "theverge",
  "techcrunch",
];

function includesAny(value: string, markers: string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

function endsWithAny(value: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

function classifySourceType(url: string): SourceType {
  const domain = domainFromUrl(url).toLowerCase();

  if (endsWithAny(domain, OFFICIAL_SUFFIXES)) {
    return "official";
  }

  if (includesAny(domain, REFERENCE_MARKERS)) {
    return "reference";
  }

  if (includesAny(domain, NEWS_MARKERS)) {
    return "news";
  }

  return "other";
}

function isPrimaryCandidate(url: string): boolean {
  const sourceType = classifySourceType(url);
  return sourceType === "official" || sourceType === "reference";
}

function coalesce<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function coalesceNullable<T>(
  value: T | null | undefined,
  fallback: T | null,
): T | null {
  return value ?? fallback;
}

function coalesceOptional<T>(
  value: T | null | undefined,
  fallback?: T,
): T | undefined {
  return value ?? fallback;
}

function existingSourceOrigin(existing: SourceRecord | undefined) {
  return coalesce(existing?.sourceOrigin, "search_result");
}

function existingSourceType(existing: SourceRecord | undefined, url: string) {
  return coalesce(existing?.sourceType, classifySourceType(url));
}

function existingDescription(existing: SourceRecord | undefined) {
  return coalesceOptional(existing?.description);
}

function existingLanguage(existing: SourceRecord | undefined) {
  return coalesceNullable(existing?.language, null);
}

function existingDiscoveredAt(
  existing: SourceRecord | undefined,
  fallback: string,
) {
  return coalesce(existing?.discoveredAt, fallback);
}

function existingAgeText(existing: SourceRecord | undefined) {
  return coalesceNullable(existing?.ageText, null);
}

function existingFetchedAt(existing: SourceRecord | undefined) {
  return coalesceOptional(existing?.fetchedAt);
}

function existingLastModified(existing: SourceRecord | undefined) {
  return coalesceNullable(existing?.lastModifiedAt, null);
}

function existingPublishedAt(existing: SourceRecord | undefined) {
  return coalesceNullable(existing?.publishedAt, null);
}

function existingTitle(existing: SourceRecord | undefined, fallback: string) {
  return coalesce(existing?.title, fallback);
}

function mergeSearchResult(
  existing: SourceRecord | undefined,
  observedAt: string,
  result: SearchObservation["results"][number],
): SourceRecord {
  return {
    url: result.url,
    title: result.title,
    domain: domainFromUrl(result.url),
    sourceOrigin: existingSourceOrigin(existing),
    sourceType: existingSourceType(existing, result.url),
    description: coalesceOptional(
      result.description,
      existingDescription(existing),
    ),
    language: coalesceNullable(result.language, existingLanguage(existing)),
    discoveredAt: existingDiscoveredAt(existing, observedAt),
    ageText: coalesceNullable(result.age, existingAgeText(existing)),
    isPrimaryCandidate: isPrimaryCandidate(result.url),
    fetchedAt: existingFetchedAt(existing),
    lastModifiedAt: coalesceOptional(existingLastModified(existing)),
    publishedAt: coalesceOptional(existingPublishedAt(existing)),
  };
}

function mergeFetchObservation(
  existing: SourceRecord | undefined,
  fetch: FetchObservation,
): SourceRecord {
  return {
    url: fetch.url,
    title: coalesce(fetch.title, existingTitle(existing, fetch.url)),
    domain: domainFromUrl(fetch.url),
    sourceOrigin: "fetched_page",
    sourceType: existingSourceType(existing, fetch.url),
    description: existingDescription(existing),
    language: existingLanguage(existing),
    discoveredAt: existingDiscoveredAt(existing, fetch.observedAt),
    fetchedAt: fetch.observedAt,
    lastModifiedAt: coalesceNullable(
      fetch.lastModified,
      existingLastModified(existing),
    ),
    ageText: existingAgeText(existing),
    publishedAt: existingPublishedAt(existing),
    isPrimaryCandidate: isPrimaryCandidate(fetch.url),
  };
}

export function buildSourceRecords(
  searchObservations: SearchObservation[],
  fetchObservations: FetchObservation[],
): SourceRecord[] {
  const byUrl = new Map<string, SourceRecord>();

  for (const search of searchObservations) {
    for (const result of search.results) {
      byUrl.set(
        result.url,
        mergeSearchResult(byUrl.get(result.url), search.observedAt, result),
      );
    }
  }

  for (const fetch of fetchObservations) {
    byUrl.set(fetch.url, mergeFetchObservation(byUrl.get(fetch.url), fetch));
  }

  return [...byUrl.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function buildProvenanceManifest(args: {
  runId: string;
  prompt: string;
  assessment: FreshnessAssessment;
  sources: SourceRecord[];
  claimLedger: ClaimLedgerRecord[];
}): ProvenanceManifest {
  return {
    runId: args.runId,
    generatedAt: new Date().toISOString(),
    prompt: args.prompt,
    freshness: args.assessment,
    sourceCount: args.sources.length,
    sources: args.sources,
    claimLedger: args.claimLedger,
  };
}
