# Project Rules

## Working Rules

- Do not write implementation code unless the user explicitly asks for coding.
- When the user asks for solution/design, answer with architecture, flow, edge cases, and tradeoffs first.
- Use Bun for dependency and runtime commands. Do not introduce npm lockfiles.
- Prefer existing libraries and framework patterns over hand-built infrastructure.
- Keep deterministic money calculation in code. AI may parse and classify text, but final share/net/settlement math must not depend on model reasoning.
- Use Zod for all AI output validation and normalization.
- Use LangChain and LangGraph for AI parse/classify/plan flow.
- Do not expose chain-of-thought. Return concise reasoning summaries, validation results, and actionable output only.
- Do not show `Vertex-edge preview` in Telegram user-facing messages.
- Keep logs useful for debugging, but do not leak secrets or full API keys.

## Chat Bot Product Rules

- The bot is for Telegram groups where multiple users send expense messages over time.
- Users should not need to paste one large perfectly formatted bill.
- The bot should not try to read every ordinary group message.
- The bot should only store bill context from explicit commands.
- Do not use regex as the main detection/classification strategy.
- Detection should rely on exact Telegram commands and structured command payloads.
- The `/list` sender is the payer for every bill line in that `/list` payload after the sender has a `/set` identity.
- If a user says names with honorifics or aliases, normalize them to canonical people names before settlement.
- If the `/list` sender has no `/set` identity, ask for clarification instead of using any model-inferred payer.
- If participant list or payer is ambiguous, mark the item as needing clarification instead of forcing a settlement.
- The bot should support different group sizes; do not hardcode four people.
- Settlement output should focus on event summary, unresolved questions, net balances, and transfer steps.

## Commands

- `/set [canonical_name], [alias_1_if_have], [alias_2_if_have]`: create or update one person with many possible names.
- `/list [with the list]`: append bill lines to the current chat bill context.
- `/bill`: parse all stored list entries, return the summary, then clear the current list for the next context.

## Command Rules

- Keep commands simple. Do not add extra commands unless the user explicitly asks.
- `/set` updates the group people dictionary, not only the Telegram sender.
- `/set Dương, Don, Donkeij, Đức` means `Dương`, `Don`, `Donkeij`, and `Đức` all resolve to one canonical person: `Dương`.
- `/set` payload order matters: first name is canonical, following names are aliases.
- `/list` is the only way to add bill context.
- `/bill` is the only way to produce settlement and clear the current context.
- `/bill` must infer payer from the sender of each stored `/list` entry, not from participant names inside the line.
- Ordinary messages outside `/list` must be ignored by the bill session.
- If `/bill` finds unclear payer, participant, or amount data, return clarification instead of calculating unsafe transfer steps.

## Identity Rules

- Store a per-chat people dictionary: canonical person name, aliases, and optional linked Telegram sender ids.
- Canonical names are user-defined through `/set`; do not hardcode `Dũng`, `Quân`, `Dương`, `Nam`.
- Aliases can be totally different names for the same person, for example `Dương`, `Don`, `Donkeij`, `Đức`.
- Alias lookup must be unique per chat. One alias cannot belong to two canonical people.
- If `/set` tries to reuse an alias already owned by another person, reject it and ask the group to fix the mapping.
- Sender id can be linked to canonical person opportunistically when the sender creates `/set`, but the people dictionary is the source of truth.
- Money settlement should use canonical names only.

## Expense Session Rules

- Store `/list` payloads with metadata: chat id, message id, sender id, sender canonical name, timestamp, text.
- Each chat has one active list context.
- `/list` appends to the active list context.
- `/bill` parses the active list context together with sender metadata and identity mappings.
- After successful `/bill`, clear the active list context automatically.
- If `/bill` cannot complete because of ambiguity, keep the active list context so users can fix it.

## Output Rules

- Telegram summary should not include graph internals.
- Telegram summary should include:
  - Parsed events
  - Missing/ambiguous items, if any
  - Net balance
  - Minimal transfer steps
- If there are unresolved items, settlement should either exclude them clearly or ask for clarification before finalizing.
