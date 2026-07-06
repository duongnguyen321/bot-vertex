import { Injectable } from '@nestjs/common';
import type {
  BillListEntry,
  ChatId,
  ExpenseInput,
  UnresolvedItem,
} from './expense.schema';
import type { BillParseResult } from './bill-parser.schema';
import type { PeopleRepository } from './people.store';

export type NormalizedBill =
  | { expenseInput: ExpenseInput; unresolved: [] }
  | { expenseInput?: undefined; unresolved: UnresolvedItem[] };

@Injectable()
export class BillNormalizerService {
  async normalize(
    parsed: BillParseResult,
    entries: BillListEntry[],
    chatId: ChatId,
    people: PeopleRepository,
  ): Promise<NormalizedBill> {
    const events: ExpenseInput['events'] = [];
    const unresolved: UnresolvedItem[] = [];

    for (const event of parsed.events) {
      const sourceEntry = entries.find(
        (entry) => entry.messageId === event.sourceMessageId,
      );

      // Resolve beneficiaries first, independent of the payer check. Order
      // matters here: the plan's own worked example ("Unresolved /bill")
      // expects unresolved beneficiary names to be listed BEFORE the
      // "ai trả tiền?" question, in beneficiary order. Bailing out early on
      // a missing payer (as the original pseudocode did) would silently
      // drop the beneficiary-unresolved items and produce the wrong order.
      const beneficiaries: ExpenseInput['events'][number]['beneficiaries'] = [];
      let hasUnresolvedBeneficiary = false;

      for (const beneficiary of event.beneficiaries) {
        const person = await people.resolveName(chatId, beneficiary.name);
        if (!person) {
          unresolved.push({
            sourceMessageId: event.sourceMessageId,
            question: `"${beneficiary.name}" chưa có trong danh sách tên. Dùng /set để thêm.`,
          });
          hasUnresolvedBeneficiary = true;
          continue;
        }
        beneficiaries.push({ person, amountVnd: beneficiary.amountVnd });
      }

      const paidBy = event.paidBy
        ? await people.resolveName(chatId, event.paidBy)
        : sourceEntry?.senderCanonicalName;

      if (!paidBy) {
        unresolved.push({
          sourceMessageId: event.sourceMessageId,
          question: `${event.title}: ai trả tiền?`,
        });
      }

      if (hasUnresolvedBeneficiary || !paidBy) continue;

      events.push({
        title: event.title,
        amountVnd: event.amountVnd,
        paidBy,
        beneficiaries,
      });
    }

    for (const item of parsed.unresolved) {
      unresolved.push({
        sourceMessageId: item.sourceMessageId,
        question: item.question,
      });
    }

    if (unresolved.length > 0 || events.length === 0) {
      return { unresolved };
    }

    return { expenseInput: { currency: 'VND', events }, unresolved: [] };
  }
}
