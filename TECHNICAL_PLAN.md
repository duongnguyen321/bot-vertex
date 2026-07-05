# Technical Plan: Simple `/set`, `/list`, `/bill` Flow

## Goal

Move the bot from one-shot mentioned parsing to a simple explicit command flow:

- `/set Dương, Don, Donkeij, Đức`
- `/list ...`
- `/bill`

The bot should not inspect ordinary chat messages. It should only store bill context from `/list`, normalize people through `/set`, and generate settlement through `/bill`.

## Non-Goals

- Do not add extra commands in this phase.
- Do not use regex for command detection or expense detection.
- Do not show vertex-edge internals in Telegram replies.
- Do not let AI calculate final money settlement.
- Do not hardcode the number of people.

## Current Files

- `src/bot/bot.update.ts`
  - Current Telegram text handler.
  - Currently handles mentions and direct parse.
  - Needs to become command router for `/set`, `/list`, `/bill`.
  - **Must remove `@On('text')` entirely** (or guard it to a no-op). Telegraf fires `@Command()` handlers AND `@On('text')` handlers for the same update — command messages are still `text` messages. Leaving `onText` in place means `/set ...` gets processed twice: once by the new command handler, once by the old mention/parse flow, which will call `moneyGraph.reply()` with the raw `/set Dương, Don` string and produce a confusing AI parse error. Delete `shouldHandle`, `cleanMention`, `errorHint` usage tied to free text, or repurpose `errorHint` as a shared helper used by all three command handlers.

- `src/bot/money-graph.service.ts`
  - Current LangGraph parse -> calculate -> format workflow.
  - Needs a batch parse method for stored `/list` entries with sender metadata and alias dictionary.
  - Decide fate of existing `run()` / `reply()` / free-text `parse()`: since "bot should not inspect ordinary chat messages" is a stated goal, these should be deleted (not left dead) once `parseBillSession` replaces them, otherwise dead LLM-call paths linger in the service and confuse future readers.

- `src/bot/expense.schema.ts`
  - Current Zod expense schemas.
  - Needs session, identity, command, and unresolved-item schemas.

- `src/bot/settlement.service.ts`
  - Deterministic ledger/net/greedy settlement.
  - Should stay mostly unchanged.

- `src/bot/formatter.service.ts`
  - Current Telegram response formatter.
  - Must remove `Vertex-edge preview`.
  - Needs support for unresolved questions.

- `src/bot/bot.module.ts`
  - Add new session/identity providers.

- `src/bot/settlement.service.spec.ts`
  - Extend with command-flow tests.

## New Files

- `src/bot/bill-session.store.ts`
  - In-memory per-chat active list context.
  - Later can be replaced by Redis/Postgres without changing command flow.

- `src/bot/people.store.ts`
  - In-memory per-chat canonical people dictionary.
  - Handles alias uniqueness and name resolution.

- `src/bot/command.schema.ts`
  - Zod schemas for parsed command payloads.

- `src/bot/bill-parser.schema.ts`
  - Zod schemas for AI output when parsing stored `/list` messages.

## Data Model

```ts
type ChatId = number | string;
type UserId = number | string;

type PersonProfile = {
  canonicalName: string;
  aliases: string[];
  linkedTelegramUserIds: UserId[];
};

type PeopleDictionary = {
  chatId: ChatId;
  people: PersonProfile[];
};

type BillListEntry = {
  chatId: ChatId;
  messageId: number;
  senderId: UserId;
  senderDisplayName: string;
  senderCanonicalName?: string;
  createdAt: string;
  text: string;
};

type BillSession = {
  chatId: ChatId;
  entries: BillListEntry[];
};
```

## Command Contract

### `/set`

Input:

```text
/set Dương, Don, Donkeij, Đức
```

Meaning:

```ts
{
  canonicalName: "Dương",
  aliases: ["Don", "Donkeij", "Đức"]
}
```

Rules:

- Split command arguments by comma using a structured parser helper, not regex detection.
- Trim spaces.
- First item is canonical.
- Remaining items are aliases.
- Canonical name is also a valid lookup key.
- Alias lookup is case-insensitive and accent-preserving for display.
- One alias cannot map to two people in the same chat.

Conflict example:

```text
/set Dương, Đức
/set Dũng, Đức
```

Reply:

```text
Alias "Đức" đã thuộc về Dương, không thể gán cho Dũng.
```

### `/list`

Input:

```text
/list
- Đặt sân đánh cầu: 200k, A Nam, a Dũng, a Quân
- Đặt nước đánh cầu: 500k, a Nam, a Dũng, a Quân
```

Rules:

- Store entire payload after command.
- Attach sender metadata.
- If sender already maps to a canonical person, store `senderCanonicalName`.
- Do not parse immediately unless needed for a small acknowledgement.
- Reply should be short:

```text
Đã thêm 2 dòng vào bill hiện tại.
```

### `/bill`

Rules:

- Load all current `/list` entries for the chat.
- Load people dictionary for the chat.
- Build AI parse input containing:
  - each list entry text
  - sender canonical name if known
  - sender display name
  - known canonical names and aliases
- AI parses list entries into structured events.
- Zod validates and normalizes output.
- Any alias is resolved to canonical name before settlement.
- Payer rule:
  - Always use the `/list` sender canonical name for every event extracted from that `/list` message.
  - Ignore model-emitted `paidBy` in this phase because the simple command flow makes sender ownership the source of truth.
  - If sender canonical name is unknown, mark event unresolved.
- If unresolved items exist, reply with clarification and keep session.
- If no unresolved items, calculate settlement, reply, then clear session.

## No Regex Detection Rule

Command detection should use Telegraf command handlers:

```ts
@Command("set")
async setName(@Ctx() ctx: Context) {}

@Command("list")
async addList(@Ctx() ctx: Context) {}

@Command("bill")
async createBill(@Ctx() ctx: Context) {}
```

For payload parsing, prefer simple command argument parsing:

```ts
function parseCommaList(payload: string): string[] {
  return payload
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
```

This is allowed because it is structured command payload parsing, not message detection.

## Zod Schemas

```ts
const SetCommandSchema = z.object({
  canonicalName: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
});

const BillListEntrySchema = z.object({
  chatId: z.union([z.string(), z.number()]),
  messageId: z.number(),
  senderId: z.union([z.string(), z.number()]),
  senderDisplayName: z.string(),
  senderCanonicalName: z.string().optional(),
  createdAt: z.string(),
  text: z.string().trim().min(1),
});

const ParsedBillEventSchema = z.object({
  sourceMessageId: z.number(),
  title: z.string().trim().min(1),
  amountVnd: z.number().positive(),
  paidBy: z.string().trim().min(1).optional(),
  beneficiaries: z.array(
    z.object({
      name: z.string().trim().min(1),
      amountVnd: z.number().nonnegative().optional(),
    }),
  ).min(1),
});

const BillParseResultSchema = z.object({
  events: z.array(ParsedBillEventSchema),
  unresolved: z.array(
    z.object({
      sourceMessageId: z.number(),
      reason: z.string(),
      question: z.string(),
    }),
  ).default([]),
});
```

## People Store Logic

```ts
class PeopleStore {
  setPerson(chatId: ChatId, canonicalName: string, aliases: string[], senderId?: UserId) {
    const dictionary = this.getDictionary(chatId);
    const allNames = [canonicalName, ...aliases];

    for (const name of allNames) {
      const owner = this.findOwner(dictionary, name);
      if (owner && owner.canonicalName !== canonicalName) {
        throw new AliasConflictError(name, owner.canonicalName, canonicalName);
      }
    }

    upsert profile by canonicalName;
    merge aliases;
    optionally link senderId;
  }

  resolveName(chatId: ChatId, rawName: string): string | undefined {
    return matching canonicalName from canonical names or aliases;
  }
}
```

Normalization:

- Trim whitespace.
- Compare case-insensitive **using `toLocaleLowerCase('vi-VN')`, not `toLowerCase()`** — plain `toLowerCase()` mishandles some Vietnamese combining diacritics and Đ/đ casing inconsistently across Node versions. Centralize this in one `normalizeKey(name: string): string` helper used by every lookup so `people.store.ts` and any future alias lookup don't drift.
- Preserve original canonical display name.
- Do not strip Vietnamese accents unless explicitly requested later, because `Duc` and `Đức` can be different aliases by user choice.

## Bill Session Store Logic

```ts
class BillSessionStore {
  append(chatId: ChatId, entry: BillListEntry) {
    get or create session;
    push entry;
  }

  getEntries(chatId: ChatId): BillListEntry[] {
    return current entries;
  }

  clear(chatId: ChatId) {
    remove active session;
  }
}
```

## `/bill` Detailed Logic

```ts
async function handleBill(ctx: Context) {
  const chatId = getChatId(ctx);
  const entries = billSessionStore.getEntries(chatId);
  const people = peopleStore.getDictionary(chatId);

  if (entries.length === 0) {
    reply("Chưa có dòng bill nào. Gửi /list trước nhé.");
    return;
  }

  try {
    const parsed = await moneyGraph.parseBillSession({ entries, people });
    const normalized = normalizeParsedBill(parsed, entries, people);

    if (normalized.unresolved.length > 0) {
      reply(formatUnresolved(normalized.unresolved));
      return; // session kept intentionally
    }

    // settlementService.calculate() throws plain Error on mismatched
    // fixed-share totals (see settlement.service.ts resolveShares) —
    // must not crash the update handler or leak a stack trace to Telegram.
    const result = settlementService.calculate(normalized.expenseInput);
    reply(formatter.format(result));
    billSessionStore.clear(chatId); // session cleared ONLY on full success
  } catch (error) {
    logger.error(error);
    reply(
      'Mình chưa chốt được bill này (lỗi parse hoặc số tiền không khớp). Bill hiện tại vẫn được giữ lại.',
    );
    // do NOT clear session — let user retry /bill after fixing /set or /list
  }
}
```

## Alias Resolution Logic

```ts
function normalizeParsedBill(parsed, entries, people): {
  expenseInput?: ExpenseInput;
  unresolved: UnresolvedItem[];
} {
  const events = [];
  const unresolved = [];

  for (const event of parsed.events) {
    const sourceEntry = findEntry(event.sourceMessageId);
    const paidBy =
      sourceEntry.senderCanonicalName;

    if (!paidBy) {
      unresolved.push({
        sourceMessageId: event.sourceMessageId,
        question: `${event.title}: ai trả tiền?`,
      });
      continue;
    }

    const beneficiaries = [];
    for (const beneficiary of event.beneficiaries) {
      const person = people.resolveName(beneficiary.name);
      if (!person) {
        unresolved.push({
          sourceMessageId: event.sourceMessageId,
          question: `${event.title}: "${beneficiary.name}" là ai? Hãy /set trước.`,
        });
        continue;
      }
      beneficiaries.push({ person, amountVnd: beneficiary.amountVnd });
    }

    events.push({ title: event.title, amountVnd: event.amountVnd, paidBy, beneficiaries });
  }

  return unresolved.length
    ? { unresolved }
    : { expenseInput: { currency: "VND", events }, unresolved: [] };
}
```

## Formatter Changes

Remove:

```text
Vertex-edge preview
```

Keep:

```text
Đã chốt bill.

Sự kiện
1. Đặt sân đánh cầu: 200.000đ - Nam trả

Net balance
Nam: +...
Dũng: -...

Cách chuyển ít bước
Dũng chuyển Nam: ...
```

For unresolved:

```text
Chưa chốt được vì cần rõ thêm:
1. Đặt sân đánh cầu: ai trả tiền?
2. "Donkeij" chưa có trong danh sách tên. Dùng /set để thêm.

Bill hiện tại vẫn được giữ lại.
```

## Critical Gaps Found in Code Review

These are real risks found by diffing this plan against the current `src/bot/*.ts`, not stylistic nits — worth fixing before implementation starts.

1. **Command/text handler collision.** `bot.update.ts` currently has `@On('text')`. Telegraf delivers command messages to both `@On('text')` and `@Command()` handlers unless the old handler is removed or made command-aware. Without this fix, `/set`, `/list`, `/bill` will double-process on day one.

2. **Structured-output schema shape for `parseBillSession`.** The existing `LlmExpenseInputSchema` is deliberately flat (no `z.union`) because `ChatOpenAI.withStructuredOutput(..., { method: 'jsonMode' })` needs a JSON-schema-compatible shape. `BillParseResultSchema` as drafted is fine for post-validation, but the schema passed *into* `withStructuredOutput` should follow the same two-tier split already established: a flat `LlmBillParseResultSchema` (what you ask DeepSeek for) → `BillParseResultSchema` (Zod transform/validation after). Add this split explicitly to `bill-parser.schema.ts` instead of reusing `ParsedBillEventSchema` for both roles, and reuse the existing `person`/`name` fallback transform pattern from `LlmBeneficiarySchema` so the LLM's inconsistent key naming doesn't silently produce unresolved items.

3. **Telegram command payload extraction detail.** In groups, Telegram sends the command as `/set@YourBotName Dương, Don` — the `@botUsername` suffix is attached to the command token itself, not just trailing mentions elsewhere in the text. `ctx.message.text` needs the leading `/command` (and optional `@botUsername`) stripped before `parseCommaList`/raw payload capture, reusing the existing `this.botUsername` config value already in `bot.update.ts`.

4. **Telegram 4096-char reply limit.** `/bill` replies can grow unbounded with event count (each line ~40–60 chars). Add a truncation/pagination rule to `formatter.service.ts` for chats with many `/list` entries, or the bot will throw on `ctx.reply` for large bills.

5. **Store interfaces, not concrete classes.** `bill-session.store.ts` and `people.store.ts` are described as swappable to Redis/Postgres "later," but if `bot.update.ts` and `money-graph.service.ts` depend on the concrete classes directly, swapping later means touching every call site. Define `PeopleRepository` / `BillSessionRepository` interfaces now, have the in-memory classes implement them, and inject via interface token in `bot.module.ts` — zero-cost now, avoids a rewrite later.

## Todo

1. Update formatter
   - File: `src/bot/formatter.service.ts`
   - Remove graph preview from user-facing output.

2. Add command schemas
   - File: `src/bot/command.schema.ts`
   - Add Zod schemas for `/set`, `/list`, `/bill` payloads.

3. Add people store
   - File: `src/bot/people.store.ts`
   - Store per-chat canonical names and aliases.
   - Enforce alias uniqueness.
   - Resolve raw names to canonical names.

4. Add bill session store
   - File: `src/bot/bill-session.store.ts`
   - Store `/list` entries per chat.
   - Clear on successful `/bill`.
   - Keep entries when unresolved.

5. Replace generic text handling with command handlers
   - File: `src/bot/bot.update.ts`
   - Use Telegraf command decorators for `set`, `list`, `bill`.
   - Ignore ordinary text messages.

6. Add bill-session parse method
   - File: `src/bot/money-graph.service.ts`
   - Add `parseBillSession({ entries, people })`.
   - Prompt DeepSeek with structured session data.
   - Validate with JSON-schema-compatible LLM schema, then normalize with Zod.

7. Add normalization service or helper
   - File: `src/bot/bill-normalizer.service.ts`
   - Resolve aliases.
   - Use each `/list` sender as payer for events extracted from that sender's entry.
   - Produce `ExpenseInput` or unresolved questions.

8. Wire providers
   - File: `src/bot/bot.module.ts`
   - Register stores and normalizer.

9. Add tests
   - File: `src/bot/people.store.spec.ts`
   - Test `/set Dương, Don, Donkeij, Đức`.
   - Test alias conflict.

   - File: `src/bot/bill-normalizer.service.spec.ts`
   - Test payer ownership from each `/list` sender.
   - Test unknown alias unresolved.
   - Test normalized `ExpenseInput`.

   - File: `src/bot/settlement.service.spec.ts`
   - Keep existing settlement tests.

10. Update README
    - File: `README.md`
    - Document `/set`, `/list`, `/bill` only.

11. Remove old free-text flow
    - File: `src/bot/bot.update.ts`
    - Delete `@On('text')`, `shouldHandle`, `cleanMention`.
    - File: `src/bot/money-graph.service.ts`
    - Delete `run()`, `reply()`, and the free-text `parse()` method once `parseBillSession` is wired in, so no dead LLM-call path remains.

12. Define repository interfaces
    - File: `src/bot/people.store.ts` / `src/bot/bill-session.store.ts`
    - Export `PeopleRepository` / `BillSessionRepository` interfaces; in-memory classes implement them; register via interface token in `bot.module.ts`.

13. Handle reply length limit
    - File: `src/bot/formatter.service.ts`
    - Truncate or paginate `/bill` output when event count would exceed Telegram's 4096-char message limit.

## Test Cases

### Alias Mapping

Input:

```text
/set Dương, Don, Donkeij, Đức
```

Expected:

```ts
resolveName("Don") === "Dương"
resolveName("Donkeij") === "Dương"
resolveName("Đức") === "Dương"
resolveName("Dương") === "Dương"
```

### Alias Conflict

Input:

```text
/set Dương, Đức
/set Dũng, Đức
```

Expected:

```text
Alias "Đức" đã thuộc về Dương, không thể gán cho Dũng.
```

### Payer Inference

Setup:

```text
/set Nam, a Nam
Nam sends:
/list
- Đặt sân đánh cầu: 200k, A Nam, a Dũng, a Quân
```

Expected parsed event:

```ts
{
  title: "Đặt sân đánh cầu",
  amountVnd: 200000,
  paidBy: "Nam",
  beneficiaries: [
    { person: "Nam" },
    { person: "Dũng" },
    { person: "Quân" },
  ],
}
```

### Sender Ownership Across Multiple `/list` Messages

Setup:

```text
/set Dương, Don, Donkeij, Donkey
/set Quyên, Cuynn, Cuyn, Quin, Queen

Dương sends:
/list
Bún lòng: 50k cuynn
Trà sữa 100k, quyên

Quyên sends:
/list Chân gà sả tắc: 90k,Dương
```

Expected:

```ts
[
  { title: "Bún lòng", paidBy: "Dương", beneficiaries: [{ person: "Quyên" }] },
  { title: "Trà sữa", paidBy: "Dương", beneficiaries: [{ person: "Quyên" }] },
  { title: "Chân gà sả tắc", paidBy: "Quyên", beneficiaries: [{ person: "Dương" }] },
]
```

Expected settlement:

```text
Quyên chuyển Dương: 60.000đ
```

### Successful `/bill`

Input:

```text
/set Nam, a Nam
/set Dũng, a Dũng
/set Quân, bạn Quân
/set Dương, Don, em Dương

Nam:
/list
- Đặt sân đánh cầu: 200k, A Nam, a Dũng, a Quân

Dương:
/list
- Đặt xe đi đánh cầu: 200k, em Dương, bạn Quân, a Nam

/bill
```

Expected:

- Events parsed with canonical names.
- Settlement calculated by `SettlementService`.
- Session cleared after success.

### Unresolved `/bill`

Input:

```text
/list
- Đặt sân: 200k, Tèo, Tý
/bill
```

Expected:

```text
Chưa chốt được vì cần rõ thêm:
1. "Tèo" chưa có trong danh sách tên. Dùng /set để thêm.
2. "Tý" chưa có trong danh sách tên. Dùng /set để thêm.
3. Đặt sân: ai trả tiền?

Bill hiện tại vẫn được giữ lại.
```
