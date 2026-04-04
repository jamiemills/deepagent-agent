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

// ok: boundary.require-service-body-validation
const parsedBody = researchJobRequestSchema.parse(request.body);

// ruleid: boundary.require-service-body-validation
const rawBody = request.body;

// ok: boundary.require-api-response-validation
const parsedResponse = researchJobRecordSchema.parse(await response.json());

// ruleid: boundary.require-api-response-validation
const rawResponse = await response.json();

export const fixtureReferences = {
  parsedBody,
  rawBody,
  parsedResponse,
  rawResponse,
};
