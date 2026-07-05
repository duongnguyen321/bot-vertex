# Bot Vertex

NestJS Telegram bot for splitting group expenses from messy Vietnamese text.

Flow:

1. User mentions the bot in Telegram.
2. LangChain + DeepSeek parse the text into JSON.
3. Zod validates the parsed expense schema.
4. Code calculates shares, ledger rows, net balances, and greedy settlement.
5. The bot replies with event summary, balances, transfer steps, and a vertex-edge preview.

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

In a group, mention the bot or use `/share` / `/split`:

```text
@mension_bot
- Tiền phở: 200k - Dũng trả - Quân: 50, còn lại Dương, Dũng tự chia
- Tiền 1000M: 177k - Quân trả - Dũng, Dương, Quân
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
