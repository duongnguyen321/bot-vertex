import { SettlementService } from './settlement.service';
import { ExpenseInput, ParsedExpenseInputSchema } from './expense.schema';

describe('SettlementService', () => {
  it('calculates the sample group settlement with minimal transfers', () => {
    const input: ExpenseInput = {
      currency: 'VND',
      events: [
        {
          title: 'Tiền phở',
          amountVnd: 200000,
          paidBy: 'Dũng',
          beneficiaries: [
            { person: 'Quân', amountVnd: 50000 },
            { person: 'Dương' },
            { person: 'Dũng' },
          ],
        },
        {
          title: 'Tiền 1000M',
          amountVnd: 177000,
          paidBy: 'Quân',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Dương' },
            { person: 'Quân' },
          ],
        },
        {
          title: 'Tiền sân',
          amountVnd: 220000,
          paidBy: 'Dũng',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Nam' },
            { person: 'Dương' },
            { person: 'Quân' },
          ],
        },
        {
          title: 'Tiền nước sân cầu',
          amountVnd: 40000,
          paidBy: 'Quân',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Nam' },
            { person: 'Quân' },
          ],
        },
        {
          title: 'Tiền ăn trưa mì cay',
          amountVnd: 370000,
          paidBy: 'Quân',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Nam' },
            { person: 'Quân' },
            { person: 'Dương' },
          ],
        },
        {
          title: 'Tiền nhậu',
          amountVnd: 855000,
          paidBy: 'Dũng',
          beneficiaries: [
            { person: 'Quân' },
            { person: 'Dương' },
            { person: 'Dũng' },
          ],
        },
        {
          title: 'Tiền xem nhà hát quốc gia',
          amountVnd: 6815000,
          paidBy: 'Quân',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Dương' },
            { person: 'Quân' },
          ],
        },
        {
          title: 'Tiền di chuyển',
          amountVnd: 150000,
          paidBy: 'Dương',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Dương' },
            { person: 'Quân' },
          ],
        },
        {
          title: 'Tiền xem rạp xiếc',
          amountVnd: 9600000,
          paidBy: 'Dũng',
          beneficiaries: [
            { person: 'Dũng' },
            { person: 'Dương' },
            { person: 'Quân' },
          ],
        },
      ],
    };

    expect(new SettlementService().calculate(input).settlements).toEqual([
      { from: 'Dương', to: 'Dũng', amountVnd: 4773500 },
      { from: 'Dương', to: 'Quân', amountVnd: 1164667 },
      { from: 'Nam', to: 'Quân', amountVnd: 160833 },
    ]);
  });

  it('normalizes DeepSeek array output with beneficiary name fields', () => {
    expect(
      ParsedExpenseInputSchema.parse([
        {
          title: 'Tiền phở',
          amountVnd: 200000,
          paidBy: 'Dũng',
          beneficiaries: [
            { name: 'Quân', amountVnd: 50000 },
            { name: 'Dương' },
            { name: 'Dũng' },
          ],
        },
      ]),
    ).toEqual({
      currency: 'VND',
      events: [
        {
          title: 'Tiền phở',
          amountVnd: 200000,
          paidBy: 'Dũng',
          beneficiaries: [
            { person: 'Quân', amountVnd: 50000 },
            { person: 'Dương', amountVnd: undefined },
            { person: 'Dũng', amountVnd: undefined },
          ],
        },
      ],
    });
  });
});
