import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AliasConflictError,
  normalizeKey,
  type PeopleRepository,
} from './people.store';
import type {
  ChatId,
  PeopleDictionary,
  PersonProfile,
  UserId,
} from './expense.schema';

/**
 * Casts a Prisma Json column back to string[]. aliases/linkedTelegramUserIds
 * are stored as Json (not Prisma's native String[]) because that scalar-list
 * type is Postgres/CockroachDB-only and unavailable on SQLite — see
 * schema.prisma for the full rationale.
 */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * SQLite-backed PeopleRepository (via Prisma). Bound to PEOPLE_REPOSITORY
 * in bot.module.ts so /set data survives process restarts, keyed by the
 * Telegram group's chatId with per-user identity via linkedTelegramUserIds.
 */
@Injectable()
export class PrismaPeopleStore implements PeopleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async setPerson(
    chatId: ChatId,
    canonicalName: string,
    aliases: string[],
    senderId?: UserId,
  ): Promise<PersonProfile> {
    const chatKey = String(chatId);

    return this.prisma.$transaction(async (tx) => {
      const existingPeople = await tx.person.findMany({
        where: { chatId: chatKey },
      });

      // Same case-insensitive, Vietnamese-aware conflict check as the
      // in-memory PeopleStore — kept in application code rather than a DB
      // constraint because SQLite/Postgres have no built-in vi-VN case
      // folding.
      const allNames = [canonicalName, ...aliases];
      for (const name of allNames) {
        const owner = existingPeople.find(
          (person) =>
            normalizeKey(person.canonicalName) === normalizeKey(name) ||
            toStringArray(person.aliases).some(
              (alias) => normalizeKey(alias) === normalizeKey(name),
            ),
        );
        if (
          owner &&
          normalizeKey(owner.canonicalName) !== normalizeKey(canonicalName)
        ) {
          throw new AliasConflictError(
            name,
            owner.canonicalName,
            canonicalName,
          );
        }
      }

      const existing = existingPeople.find(
        (person) =>
          normalizeKey(person.canonicalName) === normalizeKey(canonicalName),
      );

      const dedupedAliases: string[] = [];
      for (const alias of existing
        ? [...toStringArray(existing.aliases), ...aliases]
        : aliases) {
        const alreadySeen = dedupedAliases.some(
          (seen) => normalizeKey(seen) === normalizeKey(alias),
        );
        if (!alreadySeen) dedupedAliases.push(alias);
      }

      const linkedIds = new Set(
        existing ? toStringArray(existing.linkedTelegramUserIds) : [],
      );
      if (senderId !== undefined) linkedIds.add(String(senderId));

      const saved = existing
        ? await tx.person.update({
            where: { id: existing.id },
            data: {
              aliases: dedupedAliases,
              linkedTelegramUserIds: Array.from(linkedIds),
            },
          })
        : await tx.person.create({
            data: {
              chatId: chatKey,
              canonicalName,
              aliases: dedupedAliases,
              linkedTelegramUserIds: Array.from(linkedIds),
            },
          });

      return {
        canonicalName: saved.canonicalName,
        aliases: toStringArray(saved.aliases),
        linkedTelegramUserIds: toStringArray(saved.linkedTelegramUserIds),
      };
    });
  }

  async resolveName(
    chatId: ChatId,
    rawName: string,
  ): Promise<string | undefined> {
    const people = await this.prisma.person.findMany({
      where: { chatId: String(chatId) },
    });
    return this.findOwner(people, rawName)?.canonicalName;
  }

  async resolveBySenderId(
    chatId: ChatId,
    senderId: UserId,
  ): Promise<string | undefined> {
    // SQLite's Json column type doesn't support a Postgres-array-style
    // `{ has: value }` filter, so this checks linkedTelegramUserIds in
    // application code instead of in the query — fine at group-chat scale.
    const people = await this.prisma.person.findMany({
      where: { chatId: String(chatId) },
    });
    const key = String(senderId);
    return people.find((person) =>
      toStringArray(person.linkedTelegramUserIds).includes(key),
    )?.canonicalName;
  }

  async getDictionary(chatId: ChatId): Promise<PeopleDictionary> {
    const people = await this.prisma.person.findMany({
      where: { chatId: String(chatId) },
    });
    return {
      chatId,
      people: people.map((person) => ({
        canonicalName: person.canonicalName,
        aliases: toStringArray(person.aliases),
        linkedTelegramUserIds: toStringArray(person.linkedTelegramUserIds),
      })),
    };
  }

  private findOwner(
    people: { canonicalName: string; aliases: unknown }[],
    name: string,
  ): { canonicalName: string } | undefined {
    const key = normalizeKey(name);
    return people.find(
      (person) =>
        normalizeKey(person.canonicalName) === key ||
        toStringArray(person.aliases).some(
          (alias) => normalizeKey(alias) === key,
        ),
    );
  }
}
