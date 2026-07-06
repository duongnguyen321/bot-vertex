import {
  BillBeneficiarySchema,
  BillParseResultSchema,
  LlmBillBeneficiarySchema,
} from './bill-parser.schema';

describe('bill-parser.schema', () => {
  it('coerces a stringified sourceMessageId/amountVnd to a number', () => {
    const result = BillParseResultSchema.parse({
      events: [
        {
          sourceMessageId: '6',
          title: 'Bún lòng',
          amountVnd: '50000',
          beneficiaries: [{ person: 'Quân', amountVnd: 50000 }],
        },
      ],
      unresolved: [],
    });

    expect(result.events[0].sourceMessageId).toBe(6);
    expect(result.events[0].amountVnd).toBe(50000);
  });

  it('treats an explicit null amountVnd as "no fixed amount" (split equally), not 0', () => {
    // DeepSeek sometimes emits `"amountVnd": null` instead of omitting the
    // key for beneficiaries meant to split the remainder equally. Plain
    // z.coerce.number() would silently coerce null -> 0.
    const parsed = LlmBillBeneficiarySchema.parse({
      person: 'Quân',
      amountVnd: null,
    });
    expect(parsed.amountVnd).toBeUndefined();

    const transformed = BillBeneficiarySchema.parse({
      person: 'Quân',
      amountVnd: null,
    });
    expect(transformed.amountVnd).toBeUndefined();
  });

  it('still accepts a real 0 amount when explicitly a number', () => {
    const parsed = LlmBillBeneficiarySchema.parse({
      person: 'Quân',
      amountVnd: 0,
    });
    expect(parsed.amountVnd).toBe(0);
  });
});
