import type { SourceTracker } from "../core/source-tracker.js";

// ok: architecture.no-tools-to-adapter-imports
export const trackerReference = {} as SourceTracker;

// ruleid: architecture.no-tools-to-adapter-imports
import { createActivities } from "../temporal/activities.js";

export const activityReference = createActivities;
