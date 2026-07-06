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
      .map((person) =>
        person.aliases.length
          ? `${person.canonicalName} (also called: ${person.aliases.join(', ')})`
          : person.canonicalName,
      )
      .join('; ');

    return [
      'You parse Vietnamese group-bill list messages into strict JSON.',
      'Return VND only. Convert shorthand amounts: 200k=200000, 6tr815=6815000, 9tr600=9600000.',
      'Each input message is tagged with [messageId=...] and can contain multiple bullet-point expense events; extract every event and copy the matching messageId into "sourceMessageId".',
      'Each event needs sourceMessageId, title, amountVnd, and beneficiaries.',
      'Set "paidBy" only when the line explicitly names a payer different from the message sender; otherwise omit paidBy entirely so the app can infer it from the sender.',
      'Each beneficiary must use key "person"; do not use "name".',
      'If a participant has a fixed amount, set amountVnd for that beneficiary.',
      'If the remaining amount is split equally, omit amountVnd for those beneficiaries.',
      knownNames
        ? `Known people already registered in this chat via /set (canonical name, with any aliases in parentheses): ${knownNames}.`
        : 'No people have been registered with /set yet, so beneficiary names cannot be resolved to anyone — copy them verbatim as written.',
      knownNames
        ? 'Use that list as context: when a beneficiary name in the text clearly refers to one of those people — including when written with a Vietnamese kinship/honorific prefix (anh, a, chị, c, em, e, bạn, chú, cô, bác, dì, ông, bà, cậu, mợ), a nickname, a minor misspelling, or different casing/diacritics — output that person\'s exact canonical name from the list above (not the raw text, not an alias) in "person". Only copy the raw text verbatim when it does NOT clearly match anyone in the known-people list.'
        : 'Copy each beneficiary name exactly as written in the text.',
      'If a beneficiary genuinely cannot be matched to anyone (not in the known-people list and not resolvable from context) and the text is ambiguous about who it is, add an entry to "unresolved" instead of guessing, with sourceMessageId, a short reason, and a Vietnamese question to ask the user.',
      'If a line is too ambiguous to extract an amount or title at all, also add it to "unresolved".',
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
