import { z } from 'zod';

export const BillListEntrySchema = z.object({
  chatId: z.union([z.string(), z.number()]),
  messageId: z.number(),
  senderId: z.union([z.string(), z.number()]),
  senderDisplayName: z.string(),
  senderCanonicalName: z.string().optional(),
  createdAt: z.string(),
  text: z.string().trim().min(1),
});

// Flat shape requested from DeepSeek via ChatOpenAI.withStructuredOutput in
// jsonMode. Deliberately no unions/transforms here (mirrors
// LlmExpenseInputSchema in expense.schema.ts) — jsonMode needs a plain
// JSON-schema-compatible shape, not a Zod union/pipe.
//
// sourceMessageId and amountVnd use z.coerce.number() rather than z.number()
// because DeepSeek's jsonMode output isn't reliably typed — it sometimes
// emits numeric-looking values as JSON strings (e.g. "sourceMessageId": "6"),
// which LangChain's StructuredOutputParser rejects outright with a plain
// z.number(). Coercing at the schema boundary is more robust than hoping
// the model's typing is consistent across calls.
//
// DeepSeek also sometimes sends explicit `"amountVnd": null` for a
// beneficiary meant to split the remainder equally, rather than omitting
// the key entirely. Left as plain z.coerce.number(), that would coerce
// null -> 0 (Number(null) === 0) and pass .nonnegative() silently — turning
// "split equally" into "owes exactly 0", which is wrong settlement math,
// not a crash, so worse than failing loudly. Preprocessing null ->
// undefined first restores the intended "no fixed amount" meaning.
const NullableAmountSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

export const LlmBillBeneficiarySchema = z.object({
  person: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  amountVnd: NullableAmountSchema,
});

export const LlmBillEventSchema = z.object({
  sourceMessageId: z.coerce.number(),
  title: z.string().trim().min(1),
  amountVnd: z.coerce.number().positive(),
  paidBy: z.string().trim().min(1).optional(),
  beneficiaries: z.array(LlmBillBeneficiarySchema).min(1),
});

export const LlmBillUnresolvedSchema = z.object({
  sourceMessageId: z.coerce.number(),
  reason: z.string(),
  question: z.string(),
});

export const LlmBillParseResultSchema = z.object({
  events: z.array(LlmBillEventSchema).default([]),
  unresolved: z.array(LlmBillUnresolvedSchema).default([]),
});

// Post-validation shape used everywhere else in the app. Reuses the same
// person/name fallback pattern as ParsedBeneficiarySchema in
// expense.schema.ts so DeepSeek's inconsistent key naming ("name" instead of
// "person") doesn't silently turn into a false "unresolved" item.
//
// Calls .parse() imperatively inside the transform (instead of .pipe())
// because Zod v4's .pipe() requires the transform's output type to match
// the target schema's input type exactly, including optional-key vs.
// required-key-with-undefined-value — which a plain object literal like
// `{ name, amountVnd }` never satisfies when amountVnd is `.optional()`.
export const BillBeneficiaryNameSchema = z.object({
  name: z.string().trim().min(1),
  amountVnd: NullableAmountSchema,
});

export const BillBeneficiarySchema = LlmBillBeneficiarySchema.transform(
  ({ person, name, amountVnd }) =>
    BillBeneficiaryNameSchema.parse({
      name: person ?? name,
      amountVnd,
    }),
);

export const ParsedBillEventSchema = z.object({
  sourceMessageId: z.coerce.number(),
  title: z.string().trim().min(1),
  amountVnd: z.coerce.number().positive(),
  paidBy: z.string().trim().min(1).optional(),
  beneficiaries: z.array(BillBeneficiarySchema).min(1),
});

export const BillParseResultSchema = z.object({
  events: z.array(ParsedBillEventSchema).default([]),
  unresolved: z.array(LlmBillUnresolvedSchema).default([]),
});

export type ParsedBillEvent = z.infer<typeof ParsedBillEventSchema>;
export type BillParseResult = z.infer<typeof BillParseResultSchema>;
