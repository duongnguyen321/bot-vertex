import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

// Telegram only shows the "/" autocomplete menu for commands the bot has
// explicitly registered via setMyCommands — the @Command() decorators in
// bot.update.ts make the bot RESPOND to /set, /list, /bill, but they do NOT
// register them for the client-side command menu. That's a separate API
// call, done once here on startup.
//
// Two scopes are set because Telegram scopes commands per surface:
// - `default`: private 1:1 chats with the bot
// - `all_group_chats`: every group/supergroup the bot is in
// Without the group scope, /-autocomplete stays empty in groups even though
// the commands work fine when typed manually.
const BOT_COMMANDS = [
  { command: 'set', description: 'Đăng ký tên và alias: /set Dương, Don' },
  { command: 'list', description: 'Thêm dòng bill vào phiên hiện tại' },
  { command: 'bill', description: 'Chốt bill từ các dòng đã /list' },
];

@Injectable()
export class BotCommandsService implements OnModuleInit {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async onModuleInit() {
    await this.bot.telegram.setMyCommands(BOT_COMMANDS, {
      scope: { type: 'default' },
    });
    await this.bot.telegram.setMyCommands(BOT_COMMANDS, {
      scope: { type: 'all_group_chats' },
    });
    this.logger.log('Registered /set, /list, /bill with Telegram');
  }
}
