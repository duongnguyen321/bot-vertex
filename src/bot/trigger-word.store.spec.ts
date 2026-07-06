import { TriggerWordStore } from './trigger-word.store';

describe('TriggerWordStore', () => {
  it('adds words and returns the sorted full list', async () => {
    const store = new TriggerWordStore();

    await store.addWord(1, 'hủy');
    const result = await store.addWord(1, 'Ốm');

    expect(result).toEqual(expect.arrayContaining(['hủy', 'Ốm']));
    expect(result).toHaveLength(2);
  });

  it('does not add a duplicate word case-insensitively', async () => {
    const store = new TriggerWordStore();

    await store.addWord(1, 'hủy');
    const result = await store.addWord(1, 'HỦY');

    expect(result).toEqual(['hủy']);
  });

  it('removes a word case-insensitively', async () => {
    const store = new TriggerWordStore();
    await store.addWord(1, 'hủy');
    await store.addWord(1, 'Ốm');

    const result = await store.removeWord(1, 'HỦY');

    expect(result).toEqual(['Ốm']);
  });

  it('is a no-op when removing a word that is not present', async () => {
    const store = new TriggerWordStore();
    await store.addWord(1, 'hủy');

    const result = await store.removeWord(1, 'bão');

    expect(result).toEqual(['hủy']);
  });

  it('keeps word lists isolated per chat', async () => {
    const store = new TriggerWordStore();
    await store.addWord(1, 'hủy');

    expect(await store.listWords(2)).toEqual([]);
  });
});
