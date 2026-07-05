import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/types';
import { ZodError } from 'zod';
import type { Env } from '../env.validation';
import { MoneyGraphService } from './money-graph.service';

@Update()
@Injectable()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);
  private readonly botUsername?: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly moneyGraph: MoneyGraphService,
  ) {
    this.botUsername = config
      .get('BOT_USERNAME', { infer: true })
      ?.replace(/^@/, '');
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const message = ctx.message as Message.TextMessage | undefined;
    if (!message?.text || !this.shouldHandle(ctx, message.text)) return;

    const text = this.cleanMention(message.text);
    try {
      await ctx.reply(await this.moneyGraph.reply(text));
    } catch (error) {
      this.logger.error(error);
      await ctx.reply(
        [
          'Mình chưa parse chắc được đoạn này.',
          this.errorHint(error),
          'Bạn gửi theo dạng: Tên khoản: 200k - Dũng trả - Dũng, Quân, Dương.',
          'Nếu có người trả fixed: Quân: 50, còn lại Dương, Dũng tự chia.',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  private shouldHandle(ctx: Context, text: string) {
    if (ctx.chat?.type === 'private') return true;
    if (text.startsWith('/share') || text.startsWith('/split')) return true;
    return this.botUsername
      ? text.includes(`@${this.botUsername}`)
      : text.includes('@');
  }

  private cleanMention(text: string) {
    return this.botUsername
      ? text.replace(new RegExp(`@${this.botUsername}\\b`, 'gi'), '').trim()
      : text.trim();
  }

  private errorHint(error: unknown) {
    if (error instanceof ZodError) {
      return `Lỗi validate: ${error.issues
        .map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
        .join('; ')}`;
    }

    if (error instanceof Error && 'llmOutput' in error) {
      return 'Lỗi AI output: JSON chưa đúng schema chi phí.';
    }

    return '';
  }
}
