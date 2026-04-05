import { executeResearchRun } from "../core/research-runner.js";

// ok: architecture.no-temporal-to-service-imports
export const temporalReference = executeResearchRun;

// ruleid: architecture.no-temporal-to-service-imports
import { buildServer } from "../service/server.js";

export const serviceReference = buildServer;
