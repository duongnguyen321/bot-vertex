import { buildTriggerRegex, matchesTrigger } from './trigger-word.matcher';

describe('trigger-word.matcher', () => {
  const words = ['Ốm', 'hủy', 'thôi', 'bão', 'mưa', 'về sớm'];

  it('matches a single trigger word inside a longer sentence', () => {
    expect(matchesTrigger('Chiều nay tôi bị Ốm quá', words)).toBe(true);
    expect(matchesTrigger('Trời sắp có bão rồi', words)).toBe(true);
    expect(matchesTrigger('chắc phải về sớm thôi', words)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesTrigger('HỦY kèo đi mọi người', words)).toBe(true);
    expect(matchesTrigger('BÃO to lắm', words)).toBe(true);
  });

  it('does not match when the word only appears as part of a longer word', () => {
    // "hủy" should not match inside an unrelated longer token; using a
    // constructed example since Vietnamese rarely glues syllables without
    // spaces, but the boundary check should still hold.
    expect(matchesTrigger('hủyable', words)).toBe(false);
  });

  it('does not match unrelated text', () => {
    expect(matchesTrigger('Hẹn 7h tối nay nhé', words)).toBe(false);
  });

  it('returns false / undefined for an empty word list', () => {
    expect(buildTriggerRegex([])).toBeUndefined();
    expect(matchesTrigger('Ốm quá', [])).toBe(false);
  });

  it('escapes regex-special characters in a trigger word', () => {
    expect(matchesTrigger('giá 100$ nhé', ['100$'])).toBe(true);
    expect(() => matchesTrigger('an toàn', ['a.b('])).not.toThrow();
  });
});
