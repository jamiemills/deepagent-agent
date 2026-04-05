import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const lefthookBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "lefthook.cmd" : "lefthook",
);

const gitRoot = findGitRoot(projectRoot);
if (!gitRoot) {
  console.log(
    "[prepare] No Git repository detected. Skipping hook installation.",
  );
  process.exit(0);
}

function runGitConfigUnset() {
  try {
    execFileSync("git", ["config", "--unset", "core.hooksPath"], {
      cwd: gitRoot,
      stdio: "inherit",
    });
  } catch (_error) {
    // ignore failure; hooks path may already be default
  }
}

function installLefthook() {
  try {
    execFileSync(lefthookBinary, ["install"], {
      cwd: gitRoot,
      stdio: "inherit",
    });
    console.log("[prepare] Installed Lefthook hooks.");
  } catch (error) {
    console.error("[prepare] Lefthook install failed.");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runGitConfigUnset();
installLefthook();

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
