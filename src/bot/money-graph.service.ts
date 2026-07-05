import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { Runnable } from '@langchain/core/runnables';
import type { Env } from '../env.validation';
import type { BillListEntry, PeopleDictionary } from './expense.schema';
import {
  BillParseResultSchema,
  LlmBillParseResultSchema,
  type BillParseResult,
} from './bill-parser.schema';

/**
 * Batch-parses stored `/list` entries for a chat into structured bill
 * events. The old one-shot free-text `run()`/`reply()`/`parse()` flow (and
 * the LangGraph parse->calculate->format state graph) has been removed:
 * the bot no longer inspects ordinary chat messages, and calculation +
 * formatting now happen directly in BotUpdate.createBill() using
 * SettlementService and FormatterService, so this service's only job is
 * the LLM parse step.
 */
@Injectable()
export class MoneyGraphService {
  private readonly parser: Runnable<unknown, unknown>;

  constructor(config: ConfigService<Env, true>) {
    const model = new ChatOpenAI({
      apiKey: config.get('DEEPSEEK_API_KEY', { infer: true }),
      model: config.get('DEEPSEEK_MODEL', { infer: true }),
      temperature: 0,
      configuration: {
        baseURL: config.get('DEEPSEEK_BASE_URL', { infer: true }),
      },
    });

    // Flat, union-free schema — required for jsonMode structured output.
    // Post-validation/transform happens separately via BillParseResultSchema.
    this.parser = model.withStructuredOutput(LlmBillParseResultSchema, {
      name: 'BillParseResult',
      method: 'jsonMode',
    }) as Runnable<unknown, unknown>;
  }

  async parseBillSession(input: {
    entries: BillListEntry[];
    people: PeopleDictionary;
  }): Promise<BillParseResult> {
    const raw = await this.parser.invoke([
      new SystemMessage(this.buildSystemPrompt(input.people)),
      new HumanMessage(this.buildSessionPayload(input.entries)),
    ]);

    return BillParseResultSchema.parse(raw);
  }

  private buildSystemPrompt(people: PeopleDictionary): string {
    const knownNames = people.people
      .map((person) => [person.canonicalName, ...person.aliases].join(' / '))
      .join('; ');

    return [
      'You parse Vietnamese group-bill list messages into strict JSON.',
      'Return VND only. Convert shorthand amounts: 200k=200000, 6tr815=6815000, 9tr600=9600000.',
      'Each input message is tagged with [messageId=...] and can contain multiple bullet-point expense events; extract every event and copy the matching messageId into "sourceMessageId".',
      'Each event needs sourceMessageId, title, amountVnd, and beneficiaries.',
      'Do not set "paidBy"; in this app the payer is always inferred from the /list message sender metadata.',
      'Each beneficiary must use key "person"; do not use "name".',
      'If a participant has a fixed amount, set amountVnd for that beneficiary.',
      'If the remaining amount is split equally, omit amountVnd for those beneficiaries.',
      knownNames
        ? `Known people in this chat (canonical / aliases): ${knownNames}.`
        : 'No people have been registered with /set yet.',
      'Do not try to match names to the known-people list yourself — copy beneficiary and payer names verbatim as written; the app resolves aliases, not you.',
      'If a line is too ambiguous to extract an amount, title, or any beneficiary, add an entry to "unresolved" instead of guessing, with sourceMessageId, a short reason, and a Vietnamese question to ask the user.',
      'Do not calculate final settlements. Do not include markdown.',
    ].join(' ');
  }

  private buildSessionPayload(entries: BillListEntry[]): string {
    return entries
      .map(
        (entry) =>
          `[messageId=${entry.messageId}] [sender=${entry.senderCanonicalName ?? entry.senderDisplayName}]\n${entry.text}`,
      )
      .join('\n\n');
  }
}
