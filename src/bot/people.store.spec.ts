import { AliasConflictError, PeopleStore } from './people.store';

describe('PeopleStore', () => {
  it('maps aliases to a canonical name', async () => {
    const store = new PeopleStore();
    await store.setPerson(1, 'Dương', ['Don', 'Donkeij', 'Đức']);

    expect(await store.resolveName(1, 'Don')).toBe('Dương');
    expect(await store.resolveName(1, 'Donkeij')).toBe('Dương');
    expect(await store.resolveName(1, 'Đức')).toBe('Dương');
    expect(await store.resolveName(1, 'Dương')).toBe('Dương');
  });

  it('resolves case-insensitively while preserving canonical display casing', async () => {
    const store = new PeopleStore();
    await store.setPerson(1, 'Dương', ['Don']);

    expect(await store.resolveName(1, 'don')).toBe('Dương');
    expect(await store.resolveName(1, 'DON')).toBe('Dương');
    expect(await store.resolveName(1, 'dương')).toBe('Dương');
  });

  it('throws AliasConflictError when an alias is reassigned to a different person', async () => {
    const store = new PeopleStore();
    await store.setPerson(1, 'Dương', ['Đức']);

    await expect(store.setPerson(1, 'Dũng', ['Đức'])).rejects.toThrow(
      AliasConflictError,
    );
    await expect(store.setPerson(1, 'Dũng', ['Đức'])).rejects.toThrow(
      'Alias "Đức" đã thuộc về Dương, không thể gán cho Dũng.',
    );
  });

  it('allows re-running /set for the same canonical name to add more aliases', async () => {
    const store = new PeopleStore();
    await store.setPerson(1, 'Dương', ['Don']);
    await store.setPerson(1, 'Dương', ['Donkeij']);

    expect(await store.resolveName(1, 'Don')).toBe('Dương');
    expect(await store.resolveName(1, 'Donkeij')).toBe('Dương');
  });

  it('keeps people dictionaries isolated per chat', async () => {
    const store = new PeopleStore();
    await store.setPerson(1, 'Dương', ['Don']);

    expect(await store.resolveName(2, 'Don')).toBeUndefined();
  });

  it('resolves a canonical name by linked Telegram sender id', async () => {
    const store = new PeopleStore();
    await store.setPerson(1, 'Nam', ['a Nam'], 555);

    expect(await store.resolveBySenderId(1, 555)).toBe('Nam');
    expect(await store.resolveBySenderId(1, 999)).toBeUndefined();
  });
});
