import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import type { Env } from '../env.validation';
import { BotUpdate } from './bot.update';
import { FormatterService } from './formatter.service';
import { MoneyGraphService } from './money-graph.service';
import { SettlementService } from './settlement.service';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        token: config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
      }),
    }),
  ],
  providers: [
    BotUpdate,
    FormatterService,
    MoneyGraphService,
    SettlementService,
  ],
  exports: [MoneyGraphService, SettlementService],
})
export class BotModule {}
