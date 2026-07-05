import {
  extractCommandPayload,
  parseCommaList,
  parseSetCommand,
} from './command.schema';

describe('command.schema', () => {
  describe('extractCommandPayload', () => {
    it('strips the leading command token', () => {
      expect(extractCommandPayload('/set Dương, Don')).toBe('Dương, Don');
    });

    it('strips a bot-username suffix attached to the command token', () => {
      expect(extractCommandPayload('/set@MyBot Dương, Don')).toBe('Dương, Don');
    });

    it('returns an empty string when there is no payload', () => {
      expect(extractCommandPayload('/bill')).toBe('');
      expect(extractCommandPayload('/bill@MyBot')).toBe('');
    });
  });

  describe('parseCommaList', () => {
    it('trims and drops empty parts', () => {
      expect(parseCommaList(' Dương ,  Don ,, Đức ')).toEqual([
        'Dương',
        'Don',
        'Đức',
      ]);
    });
  });

  describe('parseSetCommand', () => {
    it('splits canonical name and aliases', () => {
      expect(parseSetCommand('Dương, Don, Donkeij, Đức')).toEqual({
        canonicalName: 'Dương',
        aliases: ['Don', 'Donkeij', 'Đức'],
      });
    });

    it('throws on empty payload', () => {
      expect(() => parseSetCommand('')).toThrow();
    });
  });
});
