import { Injectable } from '@nestjs/common';
import { SettlementResult } from './expense.schema';

@Injectable()
export class FormatterService {
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

    const graph = [
      `Vertices: ${result.vertices.length}`,
      `Edges: ${result.edges.length}`,
      ...result.edges
        .slice(0, 12)
        .map(
          (edge) =>
            `${edge.from} --${edge.type}:${this.formatVnd(edge.amountVnd)}--> ${edge.to}`,
        ),
    ].join('\n');

    return [
      'Đã parse xong chi phí.',
      '',
      'Sự kiện',
      events,
      '',
      'Net balance',
      netRows,
      '',
      'Cách chuyển ít bước',
      transfers,
      '',
      'Vertex-edge preview',
      graph,
    ].join('\n');
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
