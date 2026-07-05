import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import type { Runnable } from '@langchain/core/runnables';
import type { Env } from '../env.validation';
import {
  ExpenseInput,
  LlmExpenseInputSchema,
  ParsedExpenseInputSchema,
  SettlementResult,
} from './expense.schema';
import { FormatterService } from './formatter.service';
import { SettlementService } from './settlement.service';

type MoneyState = {
  text: string;
  parsed?: ExpenseInput;
  result?: SettlementResult;
  response?: string;
};

const MoneyStateAnnotation = Annotation.Root({
  text: Annotation<string>,
  parsed: Annotation<ExpenseInput | undefined>,
  result: Annotation<SettlementResult | undefined>,
  response: Annotation<string | undefined>,
});

@Injectable()
export class MoneyGraphService {
  private readonly parser: Runnable<unknown, unknown>;
  private readonly graph: ReturnType<typeof this.buildGraph>;

  constructor(
    config: ConfigService<Env, true>,
    private readonly formatter: FormatterService,
    private readonly settlement: SettlementService,
  ) {
    const model = new ChatOpenAI({
      apiKey: config.get('DEEPSEEK_API_KEY', { infer: true }),
      model: config.get('DEEPSEEK_MODEL', { infer: true }),
      temperature: 0,
      configuration: {
        baseURL: config.get('DEEPSEEK_BASE_URL', { infer: true }),
      },
    });

    this.parser = model.withStructuredOutput(LlmExpenseInputSchema, {
      name: 'ExpenseInput',
      method: 'jsonMode',
    }) as Runnable<unknown, unknown>;
    this.graph = this.buildGraph();
  }

  async run(text: string): Promise<SettlementResult> {
    const state = await this.graph.invoke({ text });
    return state.result!;
  }

  async reply(text: string): Promise<string> {
    const state = await this.graph.invoke({ text });
    return state.response!;
  }

  private buildGraph() {
    return new StateGraph(MoneyStateAnnotation)
      .addNode('parse', async (state: MoneyState) => ({
        parsed: await this.parse(state.text),
      }))
      .addNode('calculate', (state: MoneyState) => ({
        result: this.settlement.calculate(state.parsed!),
      }))
      .addNode('format', (state: MoneyState) => ({
        response: this.formatter.format(state.result!),
      }))
      .addEdge(START, 'parse')
      .addEdge('parse', 'calculate')
      .addEdge('calculate', 'format')
      .addEdge('format', END)
      .compile();
  }

  private async parse(text: string): Promise<ExpenseInput> {
    const parsed = await this.parser.invoke([
      new SystemMessage(
        [
          'You parse Vietnamese group expense messages into strict JSON.',
          'Return VND only. Convert shorthand amounts: 200k=200000, 6tr815=6815000, 9tr600=9600000.',
          'Each event needs title, amountVnd, paidBy, beneficiaries.',
          'Top-level JSON should be an object: {"currency":"VND","events":[...]}.',
          'Each beneficiary must use key "person"; do not use "name".',
          'If a participant has a fixed amount, set amountVnd for that beneficiary.',
          'If the remaining amount is split equally, omit amountVnd for those beneficiaries.',
          'Do not calculate final settlements. Do not include markdown.',
        ].join(' '),
      ),
      new HumanMessage(text),
    ]);

    return ParsedExpenseInputSchema.parse(parsed);
  }
}
