import { Injectable } from '@nestjs/common';
import type { ChatId } from './expense.schema';
import { normalizeKey } from './people.store';

export const TRIGGER_WORD_REPOSITORY = Symbol('TRIGGER_WORD_REPOSITORY');

export interface TriggerWordRepository {
  /** Adds a word (no-op + still returns the list if already present, case-insensitively). */
  addWord(chatId: ChatId, word: string): Promise<string[]>;
  /** Removes a word (case-insensitively); no-op if not present. */
  removeWord(chatId: ChatId, word: string): Promise<string[]>;
  listWords(chatId: ChatId): Promise<string[]>;
}

export function sortWords(words: string[]): string[] {
  return [...words].sort((a, b) => a.localeCompare(b, 'vi-VN'));
}

/**
 * In-memory implementation. No longer wired to TRIGGER_WORD_REPOSITORY in
 * bot.module.ts (PrismaTriggerWordStore is used in production so /add'd
 * words survive restarts) — kept for unit tests.
 */
@Injectable()
export class TriggerWordStore implements TriggerWordRepository {
  private readonly words = new Map<ChatId, string[]>();

  async addWord(chatId: ChatId, word: string): Promise<string[]> {
    const trimmed = word.trim();
    if (trimmed) {
      const list = this.words.get(chatId) ?? [];
      const alreadyPresent = list.some(
        (existing) => normalizeKey(existing) === normalizeKey(trimmed),
      );
      if (!alreadyPresent) this.words.set(chatId, [...list, trimmed]);
    }
    return this.listWords(chatId);
  }

  async removeWord(chatId: ChatId, word: string): Promise<string[]> {
    const list = this.words.get(chatId) ?? [];
    this.words.set(
      chatId,
      list.filter((existing) => normalizeKey(existing) !== normalizeKey(word)),
    );
    return this.listWords(chatId);
  }

  async listWords(chatId: ChatId): Promise<string[]> {
    return sortWords(this.words.get(chatId) ?? []);
  }
}
