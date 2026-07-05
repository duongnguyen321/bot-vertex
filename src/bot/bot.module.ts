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
import { MoneyGraphService } from './money-graph.service';
import { PEOPLE_REPOSITORY } from './people.store';
import { PrismaBillSessionStore } from './prisma-bill-session.store';
import { PrismaPeopleStore } from './prisma-people.store';
import { SettlementService } from './settlement.service';

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
    BotCommandsService,
    FormatterService,
    MoneyGraphService,
    SettlementService,
    BillNormalizerService,
    // Bound via interface tokens (not the concrete classes) so a future
    // backend swap (e.g. moving off Postgres) only touches this file.
    // Postgres-backed so /set, /list, and people data survive process
    // restarts, keyed by Telegram chatId (group) and senderId (user).
    { provide: PEOPLE_REPOSITORY, useClass: PrismaPeopleStore },
    { provide: BILL_SESSION_REPOSITORY, useClass: PrismaBillSessionStore },
  ],
  exports: [MoneyGraphService, SettlementService],
})
export class BotModule {}
