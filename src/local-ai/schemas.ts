export const classificationSchema = {
  type: "object", required: ["category", "confidence", "reasons"],
  properties: { category: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, reasons: { type: "array", items: { type: "string" } } },
  additionalProperties: false,
} as const;

export const summarySchema = {
  type: "object", required: ["summary", "references"],
  properties: { summary: { type: "string" }, references: { type: "array", items: { type: "string" } } },
  additionalProperties: false,
} as const;

export const testProposalSchema = {
  type: "object", required: ["framework", "targetFile", "cases"],
  properties: {
    framework: { type: "string" }, targetFile: { type: "string" },
    cases: { type: "array", items: { type: "object", required: ["name", "arrange", "act", "assert"], properties: { name: { type: "string" }, arrange: { type: "string" }, act: { type: "string" }, assert: { type: "string" } } } },
  },
  additionalProperties: false,
} as const;
