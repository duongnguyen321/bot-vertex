import { Inject, Injectable, Logger } from '@nestjs/common';
import { Command, Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/types';
import { extractCommandPayload, parseCommaList } from './command.schema';
import { matchesTrigger } from './trigger-word.matcher';
import {
  TRIGGER_WORD_REPOSITORY,
  type TriggerWordRepository,
} from './trigger-word.store';

/**
 * Moderation flow: /add and /remove manage a per-chat list of "bàn lùi"
 * (backing-out/discouraging) trigger words, and the @On('text') listener
 * deletes any ordinary message that contains one and posts a warning.
 *
 * This is the only place in the bot that inspects ordinary chat text —
 * everything else (/set, /list, /bill in bot.update.ts) is command-only by
 * design. Requires Group Privacy to be OFF in BotFather (so the bot
 * receives all messages, not just ones addressed to it) AND the bot to be
 * a group admin with "Delete messages" permission (so ctx.deleteMessage()
 * actually works) — these are two separate Telegram settings.
 */
@Update()
@Injectable()
export class ModerationUpdate {
  private readonly logger = new Logger(ModerationUpdate.name);

  constructor(
    @Inject(TRIGGER_WORD_REPOSITORY)
    private readonly triggerWords: TriggerWordRepository,
  ) {}

  @Command('add')
  async addWords(@Ctx() ctx: Context) {
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || !ctx.chat) return;

    const words = parseCommaList(extractCommandPayload(message.text));
    if (words.length === 0) {
      await ctx.reply('Gửi kèm từ cần thêm, ví dụ: /add Ốm, hủy, thôi');
      return;
    }

    let updated: string[] = [];
    for (const word of words) {
      updated = await this.triggerWords.addWord(ctx.chat.id, word);
    }

    await ctx.reply(this.formatList(updated));
  }

  @Command('remove')
  async removeWords(@Ctx() ctx: Context) {
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || !ctx.chat) return;

    const words = parseCommaList(extractCommandPayload(message.text));
    if (words.length === 0) {
      await ctx.reply('Gửi kèm từ cần xoá, ví dụ: /remove Ốm, hủy');
      return;
    }

    let updated: string[] = [];
    for (const word of words) {
      updated = await this.triggerWords.removeWord(ctx.chat.id, word);
    }

    await ctx.reply(this.formatList(updated));
  }

  @On('text')
  async scanMessage(@Ctx() ctx: Context) {
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || !ctx.chat) return;

    // Never scan command messages — Telegraf delivers command messages
    // ("/set ...", "/add ...", etc.) to @On('text') handlers too, since a
    // command is still a text message (same issue noted in bot.update.ts).
    // Without this guard, this listener would also try to trigger-match
    // /list's multi-line bill payload and /add/@remove's own arguments.
    if (message.text.startsWith('/')) return;

    const words = await this.triggerWords.listWords(ctx.chat.id);
    if (!matchesTrigger(message.text, words)) return;

    const username =
      message.from?.username ?? message.from?.first_name ?? 'Unknown';

    try {
      await ctx.deleteMessage(message.message_id);
    } catch (error) {
      // Bot isn't an admin / lacks "Delete messages" permission in this
      // chat — still warn, but the offending message stays visible.
      this.logger.warn(
        `Could not delete message ${message.message_id} in chat ${ctx.chat.id}: ${error}`,
      );
    }

    await ctx.reply(
      `User ${username} có dấu hiệu bàn lùi, đã ngăn chặn trừ trong trứng\n> Câu vi phạm: ${message.text}`,
    );
  }

  private formatList(words: string[]): string {
    if (words.length === 0) return 'Danh sách từ hiện đang trống.';
    const lines = words
      .map((word, index) => `${index + 1}. ${word}`)
      .join('\n');
    return `Danh sách từ hiện tại:\n${lines}`;
  }
}
