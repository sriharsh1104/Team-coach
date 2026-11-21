import {
  cacheInvalidate,
  cacheSet,
  hasFreshEnough,
  revalidate,
} from '../queryCache';

describe('revalidate (stale-while-revalidate)', () => {
  beforeEach(() => cacheInvalidate());

  it('fetches once and applies only the network value when nothing is cached', async () => {
    const apply = jest.fn();
    const fetcher = jest.fn().mockResolvedValue(['a']);

    await revalidate('k', fetcher, apply);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls).toEqual([[['a'], 'network']]);
  });

  it('applies the cached value first, then the changed network value', async () => {
    cacheSet('k', ['old']);
    const apply = jest.fn();

    await revalidate('k', async () => ['new'], apply);

    expect(apply.mock.calls).toEqual([
      [['old'], 'cache'],
      [['new'], 'network'],
    ]);
  });

  it('skips the second apply when the refetch returns identical data', async () => {
    cacheSet('k', { rows: [1, 2] });
    const apply = jest.fn();

    await revalidate('k', async () => ({ rows: [1, 2] }), apply);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ rows: [1, 2] }, 'cache');
  });

  it('ignores the cache entirely when forced', async () => {
    cacheSet('k', ['old']);
    const apply = jest.fn();

    await revalidate('k', async () => ['fresh'], apply, { force: true });

    expect(apply.mock.calls).toEqual([[['fresh'], 'network']]);
  });

  it('stores the fresh value so the next call can serve it from cache', async () => {
    await revalidate('k', async () => ['a'], () => undefined);
    const apply = jest.fn();

    await revalidate('k', async () => ['a'], apply);

    expect(apply).toHaveBeenCalledWith(['a'], 'cache');
  });

  it('rejects when the fetch fails, leaving any cached value applied', async () => {
    cacheSet('k', ['old']);
    const apply = jest.fn();

    await expect(
      revalidate('k', async () => {
        throw new Error('offline');
      }, apply),
    ).rejects.toThrow('offline');
    expect(apply.mock.calls).toEqual([[['old'], 'cache']]);
  });
});

describe('hasFreshEnough', () => {
  beforeEach(() => cacheInvalidate());

  it('is false for a key that was never cached', () => {
    expect(hasFreshEnough('missing')).toBe(false);
  });

  it('is true for a cached key with no age limit', () => {
    cacheSet('k', 1);
    expect(hasFreshEnough('k')).toBe(true);
  });

  it('is false once the entry is older than the given max age', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    cacheSet('k', 1);
    jest.spyOn(Date, 'now').mockReturnValue(now + 5000);

    expect(hasFreshEnough('k', 1000)).toBe(false);
    expect(hasFreshEnough('k', 10_000)).toBe(true);
    jest.restoreAllMocks();
  });
});
