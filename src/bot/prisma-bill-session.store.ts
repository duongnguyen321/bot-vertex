import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { BillSessionRepository } from './bill-session.store';
import type { BillListEntry, ChatId } from './expense.schema';

/**
 * Postgres-backed BillSessionRepository (via Prisma). Bound to
 * BILL_SESSION_REPOSITORY in bot.module.ts so /list entries survive process
 * restarts. Upserting on the (chatId, messageId) unique key also makes
 * /list idempotent against Telegram's at-least-once update delivery.
 */
@Injectable()
export class PrismaBillSessionStore implements BillSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(chatId: ChatId, entry: BillListEntry): Promise<void> {
    const chatKey = String(chatId);

    await this.prisma.billListEntry.upsert({
      where: {
        chatId_messageId: { chatId: chatKey, messageId: entry.messageId },
      },
      create: {
        chatId: chatKey,
        messageId: entry.messageId,
        senderId: String(entry.senderId),
        senderDisplayName: entry.senderDisplayName,
        senderCanonicalName: entry.senderCanonicalName,
        text: entry.text,
      },
      update: {
        senderId: String(entry.senderId),
        senderDisplayName: entry.senderDisplayName,
        senderCanonicalName: entry.senderCanonicalName,
        text: entry.text,
      },
    });
  }

  async getEntries(chatId: ChatId): Promise<BillListEntry[]> {
    const rows = await this.prisma.billListEntry.findMany({
      where: { chatId: String(chatId) },
      orderBy: { messageId: 'asc' },
    });

    return rows.map((row) => ({
      chatId,
      messageId: row.messageId,
      senderId: row.senderId,
      senderDisplayName: row.senderDisplayName,
      senderCanonicalName: row.senderCanonicalName ?? undefined,
      createdAt: row.createdAt.toISOString(),
      text: row.text,
    }));
  }

  async clear(chatId: ChatId): Promise<void> {
    await this.prisma.billListEntry.deleteMany({
      where: { chatId: String(chatId) },
    });
  }
}
