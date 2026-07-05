import { z } from 'zod';

export const BeneficiarySchema = z.object({
  person: z.string().trim().min(1),
  amountVnd: z.number().nonnegative().optional(),
});

export const LlmBeneficiarySchema = z.object({
  person: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  amountVnd: z.number().nonnegative().optional(),
});

export const ParsedBeneficiarySchema = LlmBeneficiarySchema.transform(
  ({ person, name, amountVnd }) =>
    BeneficiarySchema.parse({
      person: person ?? name,
      amountVnd,
    }),
);

export const ExpenseEventSchema = z.object({
  title: z.string().trim().min(1),
  amountVnd: z.number().positive(),
  paidBy: z.string().trim().min(1),
  beneficiaries: z.array(BeneficiarySchema).min(1),
});

export const LlmExpenseEventSchema = z.object({
  title: z.string().trim().min(1),
  amountVnd: z.number().positive(),
  paidBy: z.string().trim().min(1),
  beneficiaries: z.array(LlmBeneficiarySchema).min(1),
});

export const ParsedExpenseEventSchema = ExpenseEventSchema.extend({
  beneficiaries: z.array(ParsedBeneficiarySchema).min(1),
}).pipe(ExpenseEventSchema);

export const ExpenseInputSchema = z.object({
  currency: z.literal('VND').default('VND'),
  events: z.array(ExpenseEventSchema).min(1),
});

export const LlmExpenseInputSchema = z.object({
  currency: z.literal('VND').default('VND'),
  events: z.array(LlmExpenseEventSchema).min(1),
});

export const ParsedExpenseInputSchema = z
  .union([
    ExpenseInputSchema,
    z.object({
      currency: z.literal('VND').default('VND'),
      events: z.array(ParsedExpenseEventSchema).min(1),
    }),
    z
      .array(ParsedExpenseEventSchema)
      .min(1)
      .transform((events) => ({
        currency: 'VND' as const,
        events,
      })),
  ])
  .transform((input) => ExpenseInputSchema.parse(input));

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;

export type LedgerEntry = {
  event: string;
  person: string;
  paidVnd: number;
  owedVnd: number;
  netVnd: number;
};

export type Settlement = {
  from: string;
  to: string;
  amountVnd: number;
};

export type MoneyVertex =
  | { id: string; type: 'person'; label: string }
  | { id: string; type: 'event'; label: string; amountVnd: number };

export type MoneyEdge = {
  from: string;
  to: string;
  type: 'paid' | 'owes';
  amountVnd: number;
};

export type SettlementResult = {
  input: ExpenseInput;
  ledger: LedgerEntry[];
  netBalances: Record<string, number>;
  settlements: Settlement[];
  vertices: MoneyVertex[];
  edges: MoneyEdge[];
};
