import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ChatId } from './expense.schema';
import { normalizeKey } from './people.store';
import { sortWords, type TriggerWordRepository } from './trigger-word.store';

/**
 * SQLite-backed TriggerWordRepository (via Prisma). One row per
 * (chatId, word) rather than a Json array — makes /add and /remove simple,
 * idempotent single-row operations instead of read-modify-write races on a
 * shared array column.
 */
@Injectable()
export class PrismaTriggerWordStore implements TriggerWordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async addWord(chatId: ChatId, word: string): Promise<string[]> {
    const trimmed = word.trim();
    const chatKey = String(chatId);

    if (trimmed) {
      const existing = await this.prisma.triggerWord.findMany({
        where: { chatId: chatKey },
      });
      const alreadyPresent = existing.some(
        (row) => normalizeKey(row.word) === normalizeKey(trimmed),
      );
      if (!alreadyPresent) {
        await this.prisma.triggerWord.create({
          data: { chatId: chatKey, word: trimmed },
        });
      }
    }

    return this.listWords(chatId);
  }

  async removeWord(chatId: ChatId, word: string): Promise<string[]> {
    const chatKey = String(chatId);
    const existing = await this.prisma.triggerWord.findMany({
      where: { chatId: chatKey },
    });
    const match = existing.find(
      (row) => normalizeKey(row.word) === normalizeKey(word),
    );
    if (match) {
      await this.prisma.triggerWord.delete({ where: { id: match.id } });
    }

    return this.listWords(chatId);
  }

  async listWords(chatId: ChatId): Promise<string[]> {
    const rows = await this.prisma.triggerWord.findMany({
      where: { chatId: String(chatId) },
    });
    return sortWords(rows.map((row) => row.word));
  }
}
