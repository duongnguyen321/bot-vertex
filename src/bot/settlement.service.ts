import { Injectable } from '@nestjs/common';
import {
  ExpenseInput,
  LedgerEntry,
  MoneyEdge,
  MoneyVertex,
  Settlement,
  SettlementResult,
} from './expense.schema';

@Injectable()
export class SettlementService {
  calculate(input: ExpenseInput): SettlementResult {
    const ledger: LedgerEntry[] = [];
    const netBalances: Record<string, number> = {};
    const personNames = new Set<string>();
    const vertices: MoneyVertex[] = [];
    const edges: MoneyEdge[] = [];

    input.events.forEach((event, index) => {
      const eventId = `event:${index}`;
      vertices.push({
        id: eventId,
        type: 'event',
        label: event.title,
        amountVnd: event.amountVnd,
      });

      this.add(netBalances, event.paidBy, event.amountVnd);
      personNames.add(event.paidBy);
      edges.push({
        from: `person:${event.paidBy}`,
        to: eventId,
        type: 'paid',
        amountVnd: event.amountVnd,
      });

      const shares = this.resolveShares(event);
      for (const [person, owedVnd] of shares) {
        personNames.add(person);
        this.add(netBalances, person, -owedVnd);
        ledger.push({
          event: event.title,
          person,
          paidVnd: person === event.paidBy ? event.amountVnd : 0,
          owedVnd,
          netVnd: (person === event.paidBy ? event.amountVnd : 0) - owedVnd,
        });
        edges.push({
          from: eventId,
          to: `person:${person}`,
          type: 'owes',
          amountVnd: owedVnd,
        });
      }
    });

    for (const label of [...personNames].sort()) {
      vertices.unshift({ id: `person:${label}`, type: 'person', label });
    }

    return {
      input,
      ledger,
      netBalances,
      settlements: this.greedySettle(netBalances),
      vertices,
      edges,
    };
  }

  private resolveShares(
    event: ExpenseInput['events'][number],
  ): Map<string, number> {
    const fixed = event.beneficiaries.filter(
      (item) => item.amountVnd !== undefined,
    );
    const flexible = event.beneficiaries.filter(
      (item) => item.amountVnd === undefined,
    );
    const fixedTotal = fixed.reduce((sum, item) => sum + item.amountVnd!, 0);

    if (fixedTotal > event.amountVnd) {
      throw new Error(
        `Event "${event.title}" has fixed shares greater than total.`,
      );
    }
    if (
      flexible.length === 0 &&
      Math.abs(fixedTotal - event.amountVnd) > 0.01
    ) {
      throw new Error(`Event "${event.title}" shares do not add up to total.`);
    }

    const flexibleShare = flexible.length
      ? (event.amountVnd - fixedTotal) / flexible.length
      : 0;
    const shares = new Map<string, number>();

    for (const item of event.beneficiaries) {
      shares.set(
        item.person,
        (shares.get(item.person) ?? 0) + (item.amountVnd ?? flexibleShare),
      );
    }

    return shares;
  }

  private greedySettle(netBalances: Record<string, number>): Settlement[] {
    const debtors = Object.entries(netBalances)
      .filter(([, amount]) => amount < -0.5)
      .map(([person, amount]) => ({ person, amount: -amount }))
      .sort((a, b) => b.amount - a.amount);
    const creditors = Object.entries(netBalances)
      .filter(([, amount]) => amount > 0.5)
      .map(([person, amount]) => ({ person, amount }))
      .sort((a, b) => b.amount - a.amount);

    const settlements: Settlement[] = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtors[debtorIndex] && creditors[creditorIndex]) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amount = Math.min(debtor.amount, creditor.amount);

      settlements.push({
        from: debtor.person,
        to: creditor.person,
        amountVnd: Math.round(amount),
      });

      debtor.amount -= amount;
      creditor.amount -= amount;
      if (debtor.amount <= 0.5) debtorIndex += 1;
      if (creditor.amount <= 0.5) creditorIndex += 1;
    }

    return settlements.filter((item) => item.amountVnd > 0);
  }

  private add(
    balances: Record<string, number>,
    person: string,
    amount: number,
  ) {
    balances[person] = (balances[person] ?? 0) + amount;
  }
}
