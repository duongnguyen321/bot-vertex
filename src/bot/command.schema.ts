import { z } from 'zod';

export const SetCommandSchema = z.object({
  canonicalName: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
});

export type SetCommand = z.infer<typeof SetCommandSchema>;

/**
 * Splits a `/set` payload into trimmed, non-empty parts.
 * This is structured command-argument parsing, not regex-based message
 * detection — allowed under the "no regex for command/expense detection" rule.
 */
export function parseCommaList(payload: string): string[] {
  return payload
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parses a raw `/set` payload into a SetCommand.
 * Throws ZodError on empty/invalid input — callers should catch and reply
 * with a usage hint (see BotUpdate.describeError).
 */
export function parseSetCommand(payload: string): SetCommand {
  const [canonicalName, ...aliases] = parseCommaList(payload);
  return SetCommandSchema.parse({ canonicalName, aliases });
}

/**
 * Strips the leading "/command" or "/command@BotUsername" token from a
 * Telegram message and returns the remaining payload, trimmed.
 *
 * Telegram attaches the bot's @username directly to the command token in
 * group chats (e.g. "/set@MyBot Dương, Don"), not just as a trailing
 * mention elsewhere in the text — this must be stripped before parsing.
 */
export function extractCommandPayload(text: string): string {
  return text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
}

/**
 * Checks whether a message's leading token is a specific command, e.g.
 * matchesCommand('/list@MyBot foo', 'list') -> true. Used to filter
 * edited_message updates (which have no @Command() routing of their own)
 * down to just the command we care about re-processing.
 */
export function matchesCommand(text: string, command: string): boolean {
  const pattern = new RegExp(`^/${command}(@\\w+)?(\\s|$)`, 'i');
  return pattern.test(text);
}
