import { Inject, Injectable, Logger } from '@nestjs/common';
import { Command, Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/types';
import { ZodError } from 'zod';
import {
  extractCommandPayload,
  matchesCommand,
  parseSetCommand,
} from './command.schema';
import {
  AliasConflictError,
  PEOPLE_REPOSITORY,
  type PeopleRepository,
} from './people.store';
import {
  BILL_SESSION_REPOSITORY,
  type BillSessionRepository,
} from './bill-session.store';
import { MoneyGraphService } from './money-graph.service';
import { BillNormalizerService } from './bill-normalizer.service';
import { SettlementService } from './settlement.service';
import { FormatterService } from './formatter.service';

// Note: the old `@On('text')` free-text/mention handler has been removed
// entirely. Telegraf delivers command messages ("/set ...") to BOTH
// `@On('text')` and `@Command()` handlers for the same update, since a
// command is still a text message — leaving the old handler in place would
// have double-processed every /set, /list, and /bill call, with the old
// handler trying (and failing) to AI-parse the raw command text.
@Update()
@Injectable()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    @Inject(PEOPLE_REPOSITORY) private readonly people: PeopleRepository,
    @Inject(BILL_SESSION_REPOSITORY)
    private readonly billSession: BillSessionRepository,
    private readonly moneyGraph: MoneyGraphService,
    private readonly normalizer: BillNormalizerService,
    private readonly settlement: SettlementService,
    private readonly formatter: FormatterService,
  ) {}

  @Command('set')
  async setName(@Ctx() ctx: Context) {
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || !ctx.chat) return;

    const chatId = ctx.chat.id;
    const payload = extractCommandPayload(message.text);

    try {
      const command = parseSetCommand(payload);
      await this.people.setPerson(
        chatId,
        command.canonicalName,
        command.aliases,
        message.from?.id,
      );
      await ctx.reply(
        `Đã lưu ${command.canonicalName}` +
          (command.aliases.length
            ? ` (alias: ${command.aliases.join(', ')}).`
            : '.'),
      );
    } catch (error) {
      await ctx.reply(this.describeError(error, 'set'));
    }
  }

  @Command('list')
  async addList(@Ctx() ctx: Context) {
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || !ctx.chat) return;

    const chatId = ctx.chat.id;
    const payload = extractCommandPayload(message.text);

    if (!payload) {
      await ctx.reply('Gửi kèm nội dung bill sau /list nhé.');
      return;
    }

    await this.storeListEntry(chatId, message, payload);
    await ctx.react('👍');
  }

  // Telegram's native "edit message" feature doubles as list editing: if
  // someone edits a /list message they already sent, this re-upserts the
  // same (chatId, messageId) row instead of creating a duplicate entry —
  // see BillSessionStore.append / PrismaBillSessionStore.append. This is
  // the fix for "list has a mismatch and I can't edit it" — just edit the
  // original Telegram message and the stored bill line updates with it.
  @On('edited_message')
  async editList(@Ctx() ctx: Context) {
    const message = ctx.editedMessage as Message.TextMessage | undefined;
    if (!message?.text || !ctx.chat) return;
    if (!matchesCommand(message.text, 'list')) return;

    const chatId = ctx.chat.id;
    const payload = extractCommandPayload(message.text);
    if (!payload) return; // don't silently wipe an entry down to nothing

    await this.storeListEntry(chatId, message, payload);
    await ctx.react('👍');
  }

  @Command('bill')
  async createBill(@Ctx() ctx: Context) {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;
    const entries = await this.billSession.getEntries(chatId);

    if (entries.length === 0) {
      await ctx.reply('Chưa có dòng bill nào. Gửi /list trước nhé.');
      return;
    }

    const people = await this.people.getDictionary(chatId);

    try {
      const parsed = await this.moneyGraph.parseBillSession({
        entries,
        people,
      });
      const normalized = await this.normalizer.normalize(
        parsed,
        entries,
        chatId,
        this.people,
      );

      if (!normalized.expenseInput) {
        await ctx.reply(this.formatter.formatUnresolved(normalized.unresolved));
        return; // session kept intentionally
      }

      // settlement.calculate() throws a plain Error on mismatched
      // fixed-share totals (see settlement.service.ts resolveShares) —
      // must not crash the update handler or leak a stack trace to Telegram.
      const result = this.settlement.calculate(normalized.expenseInput);
      await ctx.reply(this.formatter.format(result));
      await this.billSession.clear(chatId); // cleared ONLY on full success
    } catch (error) {
      this.logger.error(error);
      await ctx.reply(
        'Mình chưa chốt được bill này (lỗi parse hoặc số tiền không khớp). Bill hiện tại vẫn được giữ lại.',
      );
      // do NOT clear session — let the user retry /bill after fixing /set or /list
    }
  }

  private async storeListEntry(
    chatId: number,
    message: Message.TextMessage,
    payload: string,
  ): Promise<void> {
    const senderId = message.from?.id ?? 0;
    const senderDisplayName =
      message.from?.username ?? message.from?.first_name ?? 'Unknown';
    const senderCanonicalName = await this.people.resolveBySenderId(
      chatId,
      senderId,
    );

    await this.billSession.append(chatId, {
      chatId,
      messageId: message.message_id,
      senderId,
      senderDisplayName,
      senderCanonicalName,
      createdAt: new Date().toISOString(),
      text: payload,
    });
  }

  private describeError(error: unknown, command: string): string {
    if (error instanceof AliasConflictError) return error.message;

    if (error instanceof ZodError) {
      return `Cú pháp /${command} chưa đúng. Ví dụ: /set Dương, Don, Donkeij, Đức`;
    }

    this.logger.error(error);
    return 'Có lỗi không xác định, thử lại nhé.';
  }
}
