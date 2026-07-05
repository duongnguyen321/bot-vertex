import { BillNormalizerService } from './bill-normalizer.service';
import { PeopleStore } from './people.store';
import type { BillListEntry } from './expense.schema';
import type { BillParseResult } from './bill-parser.schema';
import { SettlementService } from './settlement.service';

describe('BillNormalizerService', () => {
  const normalizer = new BillNormalizerService();

  it('infers the payer from the /list sender when paidBy is omitted', async () => {
    const people = new PeopleStore();
    await people.setPerson(1, 'Nam', ['a Nam']);
    await people.setPerson(1, 'Dũng', ['a Dũng']);
    await people.setPerson(1, 'Quân', ['a Quân']);

    const entries: BillListEntry[] = [
      {
        chatId: 1,
        messageId: 10,
        senderId: 100,
        senderDisplayName: 'Nam',
        senderCanonicalName: 'Nam',
        createdAt: new Date().toISOString(),
        text: '- Đặt sân đánh cầu: 200k, A Nam, a Dũng, a Quân',
      },
    ];

    const parsed: BillParseResult = {
      events: [
        {
          sourceMessageId: 10,
          title: 'Đặt sân đánh cầu',
          amountVnd: 200000,
          beneficiaries: [
            { name: 'A Nam' },
            { name: 'a Dũng' },
            { name: 'a Quân' },
          ],
        },
      ],
      unresolved: [],
    };

    const result = await normalizer.normalize(parsed, entries, 1, people);

    expect(result.expenseInput).toEqual({
      currency: 'VND',
      events: [
        {
          title: 'Đặt sân đánh cầu',
          amountVnd: 200000,
          paidBy: 'Nam',
          beneficiaries: [
            { person: 'Nam', amountVnd: undefined },
            { person: 'Dũng', amountVnd: undefined },
            { person: 'Quân', amountVnd: undefined },
          ],
        },
      ],
    });
    expect(result.unresolved).toEqual([]);
  });

  it('reports unresolved beneficiaries before the payer question, in beneficiary order', async () => {
    const people = new PeopleStore(); // nobody registered

    const entries: BillListEntry[] = [
      {
        chatId: 1,
        messageId: 20,
        senderId: 200,
        senderDisplayName: 'Ai đó',
        createdAt: new Date().toISOString(),
        text: '- Đặt sân: 200k, Tèo, Tý',
      },
    ];

    const parsed: BillParseResult = {
      events: [
        {
          sourceMessageId: 20,
          title: 'Đặt sân',
          amountVnd: 200000,
          beneficiaries: [{ name: 'Tèo' }, { name: 'Tý' }],
        },
      ],
      unresolved: [],
    };

    const result = await normalizer.normalize(parsed, entries, 1, people);

    expect(result.expenseInput).toBeUndefined();
    expect(result.unresolved).toEqual([
      {
        sourceMessageId: 20,
        question: '"Tèo" chưa có trong danh sách tên. Dùng /set để thêm.',
      },
      {
        sourceMessageId: 20,
        question: '"Tý" chưa có trong danh sách tên. Dùng /set để thêm.',
      },
      { sourceMessageId: 20, question: 'Đặt sân: ai trả tiền?' },
    ]);
  });

  it('uses each /list sender as payer even if the model emits paidBy', async () => {
    const people = new PeopleStore();
    await people.setPerson(1, 'Dương', ['Don', 'Donkeij', 'Donkey'], 100);
    await people.setPerson(1, 'Quyên', ['Cuynn', 'Cuyn', 'Quin', 'Queen'], 200);

    const entries: BillListEntry[] = [
      {
        chatId: 1,
        messageId: 10,
        senderId: 100,
        senderDisplayName: 'Donkey',
        senderCanonicalName: 'Dương',
        createdAt: new Date().toISOString(),
        text: 'Bún lòng: 50k cuynn\nTrà sữa 100k, quyên',
      },
      {
        chatId: 1,
        messageId: 11,
        senderId: 200,
        senderDisplayName: 'Doraecuynn',
        senderCanonicalName: 'Quyên',
        createdAt: new Date().toISOString(),
        text: 'Chân gà sả tắc: 90k,Dương',
      },
    ];

    const parsed: BillParseResult = {
      events: [
        {
          sourceMessageId: 10,
          title: 'Bún lòng',
          amountVnd: 50000,
          beneficiaries: [{ name: 'cuynn' }],
        },
        {
          sourceMessageId: 10,
          title: 'Trà sữa',
          amountVnd: 100000,
          beneficiaries: [{ name: 'quyên' }],
        },
        {
          sourceMessageId: 11,
          title: 'Chân gà sả tắc',
          amountVnd: 90000,
          paidBy: 'Dương',
          beneficiaries: [{ name: 'Dương' }],
        },
      ],
      unresolved: [],
    };

    const result = await normalizer.normalize(parsed, entries, 1, people);

    expect(result.expenseInput?.events.map((event) => event.paidBy)).toEqual([
      'Dương',
      'Dương',
      'Quyên',
    ]);
    expect(
      new SettlementService().calculate(result.expenseInput!).settlements,
    ).toEqual([{ from: 'Quyên', to: 'Dương', amountVnd: 60000 }]);
  });
});
