import type { ResearchJobRecord } from "../core/types.js";

// ok: architecture.no-storage-to-adapter-imports
export const storageReference = {} as ResearchJobRecord;

// ruleid: architecture.no-storage-to-adapter-imports
import { buildServer } from "../service/server.js";

export const serverReference = buildServer;
