import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import type { Env } from '../env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { BillNormalizerService } from './bill-normalizer.service';
import { BILL_SESSION_REPOSITORY } from './bill-session.store';
import { BotCommandsService } from './bot-commands.service';
import { BotUpdate } from './bot.update';
import { FormatterService } from './formatter.service';
import { ModerationUpdate } from './moderation.update';
import { MoneyGraphService } from './money-graph.service';
import { PEOPLE_REPOSITORY } from './people.store';
import { PrismaBillSessionStore } from './prisma-bill-session.store';
import { PrismaPeopleStore } from './prisma-people.store';
import { PrismaTriggerWordStore } from './prisma-trigger-word.store';
import { SettlementService } from './settlement.service';
import { TRIGGER_WORD_REPOSITORY } from './trigger-word.store';

@Module({
  imports: [
    PrismaModule,
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        token: config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
      }),
    }),
  ],
  providers: [
    BotUpdate,
    ModerationUpdate,
    BotCommandsService,
    FormatterService,
    MoneyGraphService,
    SettlementService,
    BillNormalizerService,
    // Bound via interface tokens (not the concrete classes) so a future
    // backend swap only touches this file. SQLite-backed so /set, /list,
    // /add, and people data survive process restarts, keyed by Telegram
    // chatId (group) and senderId (user).
    { provide: PEOPLE_REPOSITORY, useClass: PrismaPeopleStore },
    { provide: BILL_SESSION_REPOSITORY, useClass: PrismaBillSessionStore },
    { provide: TRIGGER_WORD_REPOSITORY, useClass: PrismaTriggerWordStore },
  ],
  exports: [MoneyGraphService, SettlementService],
})
export class BotModule {}
