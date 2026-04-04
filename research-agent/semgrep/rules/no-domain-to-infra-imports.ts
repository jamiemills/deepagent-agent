import { runStatusSchema } from "./schemas.js";

// ok: architecture.no-domain-to-infra-imports
export const safeSchema = runStatusSchema;

// ruleid: architecture.no-domain-to-infra-imports
import { FileMetadataStore } from "../storage/file-metadata-store.js";

export const invalidDependency = FileMetadataStore;
