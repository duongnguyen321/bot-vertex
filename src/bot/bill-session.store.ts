import { Injectable } from '@nestjs/common';
import type { BillListEntry, BillSession, ChatId } from './expense.schema';

export const BILL_SESSION_REPOSITORY = Symbol('BILL_SESSION_REPOSITORY');

export interface BillSessionRepository {
  append(chatId: ChatId, entry: BillListEntry): Promise<void>;
  getEntries(chatId: ChatId): Promise<BillListEntry[]>;
  clear(chatId: ChatId): Promise<void>;
}

/**
 * In-memory per-chat active /list context. No longer wired to
 * BILL_SESSION_REPOSITORY in bot.module.ts — PrismaBillSessionStore is used
 * in production so /list entries survive restarts. Kept for unit tests.
 */
@Injectable()
export class BillSessionStore implements BillSessionRepository {
  private readonly sessions = new Map<ChatId, BillSession>();

  async append(chatId: ChatId, entry: BillListEntry): Promise<void> {
    const session = this.getOrCreate(chatId);
    session.entries.push(entry);
  }

  async getEntries(chatId: ChatId): Promise<BillListEntry[]> {
    return this.sessions.get(chatId)?.entries ?? [];
  }

  async clear(chatId: ChatId): Promise<void> {
    this.sessions.delete(chatId);
  }

  private getOrCreate(chatId: ChatId): BillSession {
    let session = this.sessions.get(chatId);
    if (!session) {
      session = { chatId, entries: [] };
      this.sessions.set(chatId, session);
    }
    return session;
  }
}
