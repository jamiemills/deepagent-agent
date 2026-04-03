import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const gitRoot = findGitRoot(projectRoot);
if (!gitRoot) {
  console.log(
    "[prepare] No Git repository detected. Skipping hook installation.",
  );
  process.exit(0);
}

const hooksPath =
  path.relative(gitRoot, path.join(projectRoot, ".githooks")) || ".githooks";

try {
  execFileSync("git", ["config", "core.hooksPath", hooksPath], {
    cwd: gitRoot,
    stdio: "inherit",
  });
  console.log(`[prepare] Configured core.hooksPath=${hooksPath}`);
} catch (error) {
  console.warn("[prepare] Failed to configure Git hooks path.");
  if (error instanceof Error) {
    console.warn(error.message);
  }
}

function findGitRoot(startDir) {
  let current = startDir;

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
