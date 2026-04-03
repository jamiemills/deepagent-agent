import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { claimLedgerRecordSchema } from "./schemas.js";
import type {
  ClaimLedgerRecord,
  FreshnessAssessment,
  ResearchJobRecord,
} from "./types.js";

export function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          const value = (item as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function extractFinalAiText(
  messages: Array<{ type?: string; content?: unknown }>,
): string {
  const finalMessage = [...messages]
    .reverse()
    .find((message) => message.type === "ai");
  return finalMessage ? contentToText(finalMessage.content).trim() : "";
}

export async function readCanonicalReport(
  workspaceRoot: string,
  fallbackText: string,
): Promise<string> {
  const reportPath = path.join(workspaceRoot, "out", "final-report.md");

  try {
    const report = await fs.readFile(reportPath, "utf8");
    return report.trim() || fallbackText.trim();
  } catch {
    return fallbackText.trim();
  }
}

export async function readClaimLedger(
  workspaceRoot: string,
): Promise<ClaimLedgerRecord[]> {
  const ledgerPath = path.join(workspaceRoot, "out", "claim-ledger.json");

  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);
    return z.array(claimLedgerRecordSchema).parse(parsed);
  } catch {
    return [];
  }
}

export function decorateReportMarkdown(args: {
  reportBody: string;
  record: Pick<ResearchJobRecord, "id" | "executionMode" | "reviewStatus">;
  assessment: FreshnessAssessment;
}): string {
  const lines = [
    "# Research Run",
    "",
    `- Run ID: \`${args.record.id}\``,
    `- Execution mode: \`${args.record.executionMode}\``,
    `- Review status: \`${args.record.reviewStatus}\``,
    `- Freshness sensitivity: \`${args.assessment.sensitivity}\``,
    `- Freshness verdict: \`${args.assessment.verdict}\``,
    "",
    "## Freshness Notes",
    "",
    ...args.assessment.reasons.map((reason) => `- ${reason}`),
    "",
    "## Agent Report",
    "",
    args.reportBody.trim(),
    "",
  ];

  return lines.join("\n");
}
