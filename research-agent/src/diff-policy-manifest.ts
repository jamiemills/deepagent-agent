import {
  KNOWN_POLICIES,
  POLICY_EXCEPTION_MANIFEST,
  type PolicyManifest,
  type PolicyViolation,
  matchPolicyPath,
} from "./diff-policy-shared.js";

export function parsePolicyManifest(raw: string | null): PolicyManifest {
  if (!raw) {
    return { version: 1, exceptions: [] };
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Policy exception manifest must be a JSON object.");
  }

  const manifest = parsed as Partial<PolicyManifest>;
  if (manifest.version !== 1) {
    throw new Error("Policy exception manifest version must be 1.");
  }
  if (!Array.isArray(manifest.exceptions)) {
    throw new Error(
      "Policy exception manifest must contain an exceptions array.",
    );
  }

  return {
    version: manifest.version,
    exceptions: manifest.exceptions,
  } as PolicyManifest;
}

function getValidatedId(args: {
  entry: PolicyManifest["exceptions"][number];
  seenIds: Set<string>;
}): { id: string | null; issues: string[] } {
  if (typeof args.entry.id !== "string" || !args.entry.id.trim()) {
    return {
      id: null,
      issues: ["Each exception must define a non-empty id."],
    };
  }

  const issues = args.seenIds.has(args.entry.id)
    ? [`Duplicate exception id "${args.entry.id}".`]
    : [];
  args.seenIds.add(args.entry.id);

  return { id: args.entry.id, issues };
}

function getManifestFieldIssues(args: {
  id: string;
  entry: PolicyManifest["exceptions"][number];
}): string[] {
  const issues: string[] = [];

  if (!KNOWN_POLICIES.includes(args.entry.policy)) {
    issues.push(
      `Exception "${args.id}" has unknown policy "${args.entry.policy}".`,
    );
  }
  if (!Array.isArray(args.entry.paths) || args.entry.paths.length === 0) {
    issues.push(
      `Exception "${args.id}" must include at least one path pattern.`,
    );
  }
  if (typeof args.entry.reason !== "string" || !args.entry.reason.trim()) {
    issues.push(`Exception "${args.id}" must include a non-empty reason.`);
  }

  return issues;
}

function getExpiryIssues(args: {
  id: string;
  expiresOn: string;
  today: Date;
}): string[] {
  const expiry = new Date(args.expiresOn);
  if (typeof args.expiresOn !== "string" || Number.isNaN(expiry.valueOf())) {
    return [`Exception "${args.id}" must include a valid expiresOn date.`];
  }

  return expiry < args.today
    ? [`Exception "${args.id}" expired on ${args.expiresOn}.`]
    : [];
}

function getPathMatchIssues(args: {
  id: string;
  paths: string[] | undefined;
  stagedFiles: string[];
}): string[] {
  if (!Array.isArray(args.paths)) {
    return [];
  }

  const hasMatch = args.paths.some((pattern) =>
    args.stagedFiles.some((filePath) => matchPolicyPath(pattern, filePath)),
  );
  return hasMatch
    ? []
    : [`Exception "${args.id}" does not match any staged file.`];
}

function validateManifestEntry(args: {
  entry: PolicyManifest["exceptions"][number];
  stagedFiles: string[];
  seenIds: Set<string>;
  today: Date;
}): string[] {
  const idResult = getValidatedId({
    entry: args.entry,
    seenIds: args.seenIds,
  });
  if (!idResult.id) {
    return idResult.issues;
  }

  return [
    ...idResult.issues,
    ...getManifestFieldIssues({ id: idResult.id, entry: args.entry }),
    ...getExpiryIssues({
      id: idResult.id,
      expiresOn: args.entry.expiresOn,
      today: args.today,
    }),
    ...getPathMatchIssues({
      id: idResult.id,
      paths: args.entry.paths,
      stagedFiles: args.stagedFiles,
    }),
  ];
}

function findMatchingEntries(args: {
  manifest: PolicyManifest;
  violation: PolicyViolation;
}) {
  return args.manifest.exceptions.filter(
    (entry) =>
      entry.policy === args.violation.policy &&
      entry.paths.some((pattern) =>
        args.violation.paths.some((path) => matchPolicyPath(pattern, path)),
      ),
  );
}

function findUncoveredViolationPaths(args: {
  violation: PolicyViolation;
  matchingEntries: PolicyManifest["exceptions"];
}) {
  return args.violation.paths.filter(
    (path) =>
      path !== POLICY_EXCEPTION_MANIFEST &&
      !args.matchingEntries.some((entry) =>
        entry.paths.some((pattern) => matchPolicyPath(pattern, path)),
      ),
  );
}

export function getUncoveredViolations(args: {
  manifest: PolicyManifest;
  violations: PolicyViolation[];
}): PolicyViolation[] {
  return args.violations.flatMap((violation) => {
    const matchingEntries = findMatchingEntries({
      manifest: args.manifest,
      violation,
    });
    const uncoveredPaths = findUncoveredViolationPaths({
      violation,
      matchingEntries,
    });

    return uncoveredPaths.length === 0
      ? []
      : [{ ...violation, paths: uncoveredPaths }];
  });
}

function getManifestEntryIssues(args: {
  manifest: PolicyManifest;
  stagedFiles: string[];
  seenIds: Set<string>;
  today: Date;
}) {
  return args.manifest.exceptions.flatMap((entry) =>
    validateManifestEntry({
      entry,
      stagedFiles: args.stagedFiles,
      seenIds: args.seenIds,
      today: args.today,
    }),
  );
}

export function validatePolicyManifest(args: {
  manifest: PolicyManifest;
  stagedFiles: string[];
  violations: PolicyViolation[];
  today: Date | undefined;
}): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const today = args.today ?? new Date();
  const manifestTouched = args.stagedFiles.includes(POLICY_EXCEPTION_MANIFEST);

  if (manifestTouched) {
    issues.push(
      ...getManifestEntryIssues({
        manifest: args.manifest,
        stagedFiles: args.stagedFiles,
        seenIds,
        today,
      }),
    );
  }

  for (const violation of args.violations) {
    const matchingEntries = findMatchingEntries({
      manifest: args.manifest,
      violation,
    });

    const uncoveredPaths = findUncoveredViolationPaths({
      violation,
      matchingEntries,
    });
    if (uncoveredPaths.length > 0) {
      issues.push(
        `Policy "${violation.policy}" requires an exception for: ${uncoveredPaths.join(
          ", ",
        )}.`,
      );
    }
  }

  return issues;
}
