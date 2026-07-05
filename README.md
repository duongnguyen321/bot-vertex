# Bot Vertex

NestJS Telegram bot for splitting group expenses from Vietnamese `/list` messages, using three explicit commands only: `/set`, `/list`, `/bill`. The bot does not inspect ordinary chat messages.

Flow:

1. `/set Dương, Don, Donkeij, Đức` — register a canonical name with aliases (first item is canonical, rest are aliases).
2. `/list ...` — attach a message's bill lines to the chat's current bill session (stored, not parsed yet).
3. `/bill` — parse all stored `/list` entries with DeepSeek, resolve aliases, infer missing payers from the `/list` sender, calculate settlement, and reply. If anything is ambiguous, the bot asks a clarifying question and keeps the session; nothing is cleared until `/bill` fully succeeds.

## Stack

- Bun package manager/runtime
- NestJS
- nestjs-telegraf + telegraf
- LangChain + LangGraph
- DeepSeek OpenAI-compatible API
- Zod

## Setup

```bash
bun install
cp .env.example .env
```

Fill `.env`:

```bash
TELEGRAM_BOT_TOKEN=...
BOT_USERNAME=mension_bot
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3000
```

## Run

```bash
bun run start:dev
```

In a group:

```text
/set Dương, Don, Donkeij, Đức
/set Dũng, a Dũng
/set Quân, a Quân
/set Nam, a Nam

/list
- Đặt sân đánh cầu: 200k, A Nam, a Dũng, a Quân
- Đặt nước đánh cầu: 500k, a Nam, a Dũng, a Quân

/bill
```

## Verify

```bash
bun run build
bun run test
```

The settlement test covers the sample in the prompt and expects:

```text
Dương chuyển Dũng: 4.773.500đ
Dương chuyển Quân: 1.164.667đ
Nam chuyển Quân: 160.833đ
```
