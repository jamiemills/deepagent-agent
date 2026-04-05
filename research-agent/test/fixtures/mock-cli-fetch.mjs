import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const dataDir = process.env.MOCK_API_DATA_DIR;

if (!dataDir) {
  throw new Error("MOCK_API_DATA_DIR is required for CLI integration tests");
}

const metadataDir = path.join(dataDir, "metadata");
const artifactsDir = path.join(dataDir, "artifacts");
const pendingDir = path.join(dataDir, "pending");

await fs.mkdir(metadataDir, { recursive: true });
await fs.mkdir(artifactsDir, { recursive: true });
await fs.mkdir(pendingDir, { recursive: true });

globalThis.fetch = async (input, init = {}) => {
  let rawUrl;
  if (typeof input === "string") {
    rawUrl = input;
  } else if (input instanceof URL) {
    rawUrl = input.toString();
  } else {
    rawUrl = input.url;
  }
  const url = new URL(rawUrl);
  const method = init.method ?? "GET";

  if (method === "POST" && url.pathname === "/research-jobs") {
    const payload = JSON.parse(init.body ?? "{}");
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = {
      id: runId,
      prompt: payload.prompt,
      requestedBy: payload.requestedBy ?? "operator",
      executionMode: "hosted",
      status: "queued",
      reviewStatus: "not_requested",
      freshnessSensitivity: "time_sensitive",
      freshnessVerdict: "warning",
      freshnessReasons: [],
      artifactPointers: {},
      createdAt: now,
      updatedAt: now,
    };
    await fs.writeFile(
      path.join(metadataDir, `${runId}.json`),
      JSON.stringify(record, null, 2),
    );
    await fs.writeFile(
      path.join(pendingDir, `${runId}.json`),
      JSON.stringify(payload, null, 2),
    );
    return jsonResponse(record, 202);
  }

  if (
    method === "GET" &&
    url.pathname.startsWith("/research-jobs/") &&
    !url.pathname.includes("/artifacts/")
  ) {
    const runId = url.pathname.split("/")[2];
    await maybeCompleteRun(runId);
    return jsonResponse(await readRecord(runId), 200);
  }

  if (method === "POST" && url.pathname.endsWith("/review")) {
    const runId = url.pathname.split("/")[2];
    const payload = JSON.parse(init.body ?? "{}");
    const record = await readRecord(runId);
    record.reviewStatus = payload.decision;
    record.reviewNotes = payload.notes;
    record.status =
      payload.decision === "approved" ? "completed" : "awaiting_review";
    record.updatedAt = new Date().toISOString();
    await writeRecord(record);
    return jsonResponse(record, 200);
  }

  if (method === "POST" && url.pathname.endsWith("/cancel")) {
    const runId = url.pathname.split("/")[2];
    const record = await readRecord(runId);
    record.status = "cancelled";
    record.updatedAt = new Date().toISOString();
    record.completedAt = new Date().toISOString();
    await writeRecord(record);
    return jsonResponse(record, 200);
  }

  if (method === "GET" && url.pathname.includes("/artifacts/")) {
    const segments = url.pathname.split("/");
    const runId = segments[2];
    const artifactName = segments.slice(4).join("/");
    const filePath = path.join(artifactsDir, runId, artifactName);
    try {
      const body = await fs.readFile(filePath, "utf8");
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": artifactName.endsWith(".json")
            ? "application/json"
            : "text/markdown; charset=utf-8",
        },
      });
    } catch {
      return jsonResponse({ error: "Artifact not found." }, 404);
    }
  }

  return jsonResponse({ error: "Unhandled route" }, 404);
};

async function maybeCompleteRun(runId) {
  const pendingPath = path.join(pendingDir, `${runId}.json`);
  try {
    const payload = JSON.parse(await fs.readFile(pendingPath, "utf8"));
    const record = await readRecord(runId);
    const artifactDir = path.join(artifactsDir, runId);
    await fs.mkdir(path.join(artifactDir, "notes"), { recursive: true });
    await fs.mkdir(path.join(artifactDir, "out"), { recursive: true });
    await fs.writeFile(
      path.join(artifactDir, "notes", "working.md"),
      `Working notes for ${payload.prompt}\n`,
    );
    await fs.writeFile(
      path.join(artifactDir, "out", "final-report.md"),
      `# Hosted Report\n\nPrompt: ${payload.prompt}\n`,
    );
    await fs.writeFile(
      path.join(artifactDir, "out", "claim-ledger.json"),
      JSON.stringify(
        [
          {
            claim: "Hosted claim",
            sourceUrls: ["https://official.example.com/update"],
            confidence: "high",
            notes: "mock cli fetch",
          },
        ],
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(artifactDir, "report.md"),
      "# Research Run\n\n- Freshness verdict: `passed`\n\n## Agent Report\n\n# Hosted Report\n",
    );
    await fs.writeFile(
      path.join(artifactDir, "provenance.json"),
      JSON.stringify(
        {
          runId,
          sources: [
            { url: "https://official.example.com/update" },
            { url: "https://analysis.example.com/deep-agents" },
          ],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(artifactDir, "summary.json"),
      JSON.stringify(
        {
          runId,
          freshness: { verdict: "passed" },
          sourceCount: 2,
          claimCount: 1,
        },
        null,
        2,
      ),
    );

    record.status = "completed";
    record.reviewStatus = "not_requested";
    record.freshnessVerdict = "passed";
    record.freshnessReasons = ["Found 2 recent dated sources within 30 days."];
    record.artifactPointers = {
      report: "report.md",
      provenance: "provenance.json",
      summary: "summary.json",
      notes: ["notes/working.md"],
      out: ["out/claim-ledger.json", "out/final-report.md"],
    };
    record.updatedAt = new Date().toISOString();
    record.startedAt = record.startedAt ?? new Date().toISOString();
    record.completedAt = new Date().toISOString();
    await writeRecord(record);
    await fs.rm(pendingPath, { force: true });
  } catch {
    return;
  }
}

async function readRecord(runId) {
  return JSON.parse(
    await fs.readFile(path.join(metadataDir, `${runId}.json`), "utf8"),
  );
}

async function writeRecord(record) {
  await fs.writeFile(
    path.join(metadataDir, `${record.id}.json`),
    JSON.stringify(record, null, 2),
  );
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
