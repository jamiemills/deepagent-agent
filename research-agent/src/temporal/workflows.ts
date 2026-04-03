import { proxyActivities } from "@temporalio/workflow";

import type { ResearchJobRecord, ResearchJobRequest } from "../core/types.js";

const { runHostedResearchJob } = proxyActivities<{
  runHostedResearchJob(input: {
    runId: string;
    request: ResearchJobRequest;
  }): Promise<ResearchJobRecord>;
}>({
  startToCloseTimeout: "30 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function researchJobWorkflow(input: {
  runId: string;
  request: ResearchJobRequest;
}): Promise<ResearchJobRecord> {
  return runHostedResearchJob(input);
}
