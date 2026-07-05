import { Injectable } from '@nestjs/common';
import { SettlementResult, UnresolvedItem } from './expense.schema';

@Injectable()
export class FormatterService {
  // Telegram hard-caps a single message at 4096 chars; ctx.reply() throws
  // past that. Large bills (many /list entries -> many events) can exceed
  // it, so both format() and formatUnresolved() truncate defensively.
  private static readonly TELEGRAM_MAX_LENGTH = 4096;

  format(result: SettlementResult): string {
    const netRows = Object.entries(result.netBalances)
      .sort((a, b) => b[1] - a[1])
      .map(([person, amount]) => `${person}: ${this.formatSigned(amount)}`)
      .join('\n');

    const transfers = result.settlements.length
      ? result.settlements
          .map(
            (item) =>
              `${item.from} chuyển ${item.to}: ${this.formatVnd(item.amountVnd)}`,
          )
          .join('\n')
      : 'Không cần chuyển thêm.';

    const events = result.input.events
      .map(
        (event, index) =>
          `${index + 1}. ${event.title}: ${this.formatVnd(event.amountVnd)} - ${event.paidBy} trả`,
      )
      .join('\n');

    return this.truncate(
      [
        'Đã chốt bill.',
        '',
        'Sự kiện',
        events,
        '',
        'Net balance',
        netRows,
        '',
        'Cách chuyển ít bước',
        transfers,
      ].join('\n'),
    );
  }

  formatUnresolved(unresolved: UnresolvedItem[]): string {
    const lines = unresolved
      .map((item, index) => `${index + 1}. ${item.question}`)
      .join('\n');

    return this.truncate(
      [
        'Chưa chốt được vì cần rõ thêm:',
        lines,
        '',
        'Bill hiện tại vẫn được giữ lại.',
      ].join('\n'),
    );
  }

  private truncate(text: string): string {
    if (text.length <= FormatterService.TELEGRAM_MAX_LENGTH) return text;
    const marker = '\n\n… (đã rút gọn, bill quá dài để hiển thị hết)';
    return (
      text.slice(0, FormatterService.TELEGRAM_MAX_LENGTH - marker.length) +
      marker
    );
  }

  private formatSigned(amount: number) {
    const rounded = Math.round(amount);
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${this.formatVnd(rounded)}`;
  }

  private formatVnd(amount: number) {
    return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
  }
}
