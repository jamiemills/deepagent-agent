import type {
  FreshnessAssessment,
  FreshnessSensitivity,
  SourceRecord,
} from "./types.js";

const TIME_SENSITIVE_PATTERNS = [
  /\bcurrent\b/i,
  /\blatest\b/i,
  /\btoday\b/i,
  /\byesterday\b/i,
  /\bthis week\b/i,
  /\bthis month\b/i,
  /\bthis year\b/i,
  /\brecent\b/i,
  /\bnews\b/i,
  /\bmarket\b/i,
  /\bprice\b/i,
  /\bstate of\b/i,
  /\bas of\b/i,
  /\b202[4-9]\b/i,
];

const RECENT_DAYS_THRESHOLD = 30;
const AGE_TO_DAYS: Record<string, number> = {
  minute: 0,
  hour: 0,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export function classifyFreshnessSensitivity(
  prompt: string,
): FreshnessSensitivity {
  return TIME_SENSITIVE_PATTERNS.some((pattern) => pattern.test(prompt))
    ? "time_sensitive"
    : "evergreen";
}

export function parseAgeTextToDays(ageText?: string | null): number | null {
  if (!ageText) {
    return null;
  }

  const normalized = ageText.trim().toLowerCase();
  const match = normalized.match(/(\d+)\s+(minute|hour|day|week|month|year)s?/);
  if (!match) {
    return null;
  }

  const [, amountText, unit] = match;
  if (!(amountText && unit)) {
    return null;
  }

  const amount = Number.parseInt(amountText, 10);
  const multiplier = AGE_TO_DAYS[unit];
  return multiplier === undefined ? null : amount * multiplier;
}

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function daysSince(date: Date): number {
  const now = Date.now();
  return Math.max(
    0,
    Math.floor((now - date.valueOf()) / (1000 * 60 * 60 * 24)),
  );
}

function sourceAgeInDays(source: SourceRecord): number | null {
  const ageDays = parseAgeTextToDays(source.ageText);
  if (ageDays !== null) {
    return ageDays;
  }

  const dated =
    parseDate(source.publishedAt) ?? parseDate(source.lastModifiedAt);
  if (!dated) {
    return null;
  }

  return daysSince(dated);
}

export function evaluateFreshness(
  sensitivity: FreshnessSensitivity,
  sources: SourceRecord[],
): FreshnessAssessment {
  if (sensitivity === "evergreen") {
    return {
      sensitivity,
      verdict: "not_applicable",
      reasons: [
        "Prompt classified as evergreen; strict freshness gate not required.",
      ],
      recentSourceCount: 0,
      datedSourceCount: 0,
    };
  }

  const agedSources = sources
    .map((source) => ({ source, ageDays: sourceAgeInDays(source) }))
    .filter((item) => item.ageDays !== null) as Array<{
    source: SourceRecord;
    ageDays: number;
  }>;

  const recentSources = agedSources.filter(
    (item) => item.ageDays <= RECENT_DAYS_THRESHOLD,
  );
  const officialRecentSources = recentSources.filter(
    (item) => item.source.sourceType === "official",
  );

  if (recentSources.length >= 2 || officialRecentSources.length > 0) {
    return {
      sensitivity,
      verdict: "passed",
      reasons: [
        `Found ${recentSources.length} recent dated sources within ${RECENT_DAYS_THRESHOLD} days.`,
      ],
      recentSourceCount: recentSources.length,
      datedSourceCount: agedSources.length,
    };
  }

  if (agedSources.length > 0) {
    return {
      sensitivity,
      verdict: "warning",
      reasons: [
        "The run found some dated evidence, but not enough recent support to fully satisfy the freshness gate.",
      ],
      recentSourceCount: recentSources.length,
      datedSourceCount: agedSources.length,
    };
  }

  return {
    sensitivity,
    verdict: "failed",
    reasons: [
      "No dated recent sources were captured for a time-sensitive prompt.",
    ],
    recentSourceCount: 0,
    datedSourceCount: 0,
  };
}
