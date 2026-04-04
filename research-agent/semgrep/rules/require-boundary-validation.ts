declare const request: { body: unknown };
declare const researchJobRequestSchema: {
  parse(value: unknown): unknown;
};
declare const response: {
  json(): Promise<unknown>;
};
declare const researchJobRecordSchema: {
  parse(value: unknown): unknown;
};
declare const input: {
  runId: string;
  request: unknown;
};
declare const hostedResearchJobInputSchema: {
  parse(value: unknown): unknown;
};
declare const raw: string;

// ok: boundary.require-service-body-validation
const parsedBody = researchJobRequestSchema.parse(request.body);

// ruleid: boundary.require-service-body-validation
const rawBody = request.body;

// ok: boundary.require-api-response-validation
const parsedResponse = researchJobRecordSchema.parse(await response.json());

// ruleid: boundary.require-api-response-validation
const rawResponse = await response.json();

// ok: boundary.require-temporal-input-validation
const parsedTemporalInput = hostedResearchJobInputSchema.parse(input);

// ruleid: boundary.require-temporal-input-validation
const rawTemporalRequest = input.request;

// ok: boundary.require-storage-json-validation
const parsedStoredRecord = researchJobRecordSchema.parse(JSON.parse(raw));

// ruleid: boundary.require-storage-json-validation
const rawStoredRecord = JSON.parse(raw);

export const fixtureReferences = {
  parsedBody,
  rawBody,
  parsedResponse,
  rawResponse,
  parsedTemporalInput,
  rawTemporalRequest,
  parsedStoredRecord,
  rawStoredRecord,
};
