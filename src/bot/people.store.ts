import { Injectable } from '@nestjs/common';
import type {
  ChatId,
  PeopleDictionary,
  PersonProfile,
  UserId,
} from './expense.schema';

export const PEOPLE_REPOSITORY = Symbol('PEOPLE_REPOSITORY');

export class AliasConflictError extends Error {
  constructor(
    public readonly alias: string,
    public readonly existingOwner: string,
    public readonly attemptedOwner: string,
  ) {
    super(
      `Alias "${alias}" đã thuộc về ${existingOwner}, không thể gán cho ${attemptedOwner}.`,
    );
    this.name = 'AliasConflictError';
  }
}

/**
 * Vietnamese-aware, accent-preserving, case-insensitive lookup key.
 * Uses toLocaleLowerCase('vi-VN') rather than plain toLowerCase(), which
 * mishandles some Vietnamese combining diacritics and Đ/đ casing
 * inconsistently across Node versions. Every alias/canonical-name lookup
 * (in-memory or Prisma-backed) goes through this one function so behavior
 * can't drift between implementations.
 */
export function normalizeKey(name: string): string {
  return name.trim().toLocaleLowerCase('vi-VN');
}

// Async because the production implementation (PrismaPeopleStore) hits
// Postgres. The in-memory PeopleStore below implements the same async
// signature (trivially, via `async` methods) purely so both
// implementations satisfy one interface and BotUpdate/BillNormalizerService
// don't need to know or care which backend is behind PEOPLE_REPOSITORY.
export interface PeopleRepository {
  setPerson(
    chatId: ChatId,
    canonicalName: string,
    aliases: string[],
    senderId?: UserId,
  ): Promise<PersonProfile>;
  resolveName(chatId: ChatId, rawName: string): Promise<string | undefined>;
  resolveBySenderId(
    chatId: ChatId,
    senderId: UserId,
  ): Promise<string | undefined>;
  getDictionary(chatId: ChatId): Promise<PeopleDictionary>;
}

/**
 * In-memory implementation. No longer wired to PEOPLE_REPOSITORY in
 * bot.module.ts (PrismaPeopleStore is used in production so data survives
 * restarts) — kept for unit tests that want to exercise business logic
 * (BillNormalizerService, etc.) without a database.
 */
@Injectable()
export class PeopleStore implements PeopleRepository {
  private readonly dictionaries = new Map<ChatId, PeopleDictionary>();

  async setPerson(
    chatId: ChatId,
    canonicalName: string,
    aliases: string[],
    senderId?: UserId,
  ): Promise<PersonProfile> {
    const dictionary = this.getOrCreateDictionary(chatId);
    const allNames = [canonicalName, ...aliases];

    for (const name of allNames) {
      const owner = this.findOwner(dictionary, name);
      if (
        owner &&
        normalizeKey(owner.canonicalName) !== normalizeKey(canonicalName)
      ) {
        throw new AliasConflictError(name, owner.canonicalName, canonicalName);
      }
    }

    let profile = dictionary.people.find(
      (person) =>
        normalizeKey(person.canonicalName) === normalizeKey(canonicalName),
    );

    if (!profile) {
      profile = { canonicalName, aliases: [], linkedTelegramUserIds: [] };
      dictionary.people.push(profile);
    }

    for (const alias of aliases) {
      const alreadyPresent = profile.aliases.some(
        (existing) => normalizeKey(existing) === normalizeKey(alias),
      );
      if (!alreadyPresent) profile.aliases.push(alias);
    }

    if (
      senderId !== undefined &&
      !profile.linkedTelegramUserIds.includes(senderId)
    ) {
      profile.linkedTelegramUserIds.push(senderId);
    }

    return profile;
  }

  async resolveName(
    chatId: ChatId,
    rawName: string,
  ): Promise<string | undefined> {
    const dictionary = this.dictionaries.get(chatId);
    if (!dictionary) return undefined;
    return this.findOwner(dictionary, rawName)?.canonicalName;
  }

  async resolveBySenderId(
    chatId: ChatId,
    senderId: UserId,
  ): Promise<string | undefined> {
    const dictionary = this.dictionaries.get(chatId);
    if (!dictionary) return undefined;
    return dictionary.people.find((person) =>
      person.linkedTelegramUserIds.includes(senderId),
    )?.canonicalName;
  }

  async getDictionary(chatId: ChatId): Promise<PeopleDictionary> {
    return this.getOrCreateDictionary(chatId);
  }

  private getOrCreateDictionary(chatId: ChatId): PeopleDictionary {
    let dictionary = this.dictionaries.get(chatId);
    if (!dictionary) {
      dictionary = { chatId, people: [] };
      this.dictionaries.set(chatId, dictionary);
    }
    return dictionary;
  }

  private findOwner(
    dictionary: PeopleDictionary,
    name: string,
  ): PersonProfile | undefined {
    const key = normalizeKey(name);
    return dictionary.people.find(
      (person) =>
        normalizeKey(person.canonicalName) === key ||
        person.aliases.some((alias) => normalizeKey(alias) === key),
    );
  }
}
