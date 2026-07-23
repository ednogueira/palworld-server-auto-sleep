import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

const shutdownMock = vi.fn().mockResolvedValue(undefined);
const bootstrapMock: Mock = vi.fn().mockResolvedValue({
  stateManager: {},
  shutdown: shutdownMock,
});

vi.mock('../../src/entrypoints/bootstrap', () => ({
  bootstrap: bootstrapMock,
}));

describe('index entrypoint', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    shutdownMock.mockClear();
    bootstrapMock.mockClear();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((..._args: unknown[]) => {
      throw new Error('process.exit should not be called during normal run');
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('keeps process alive without calling shutdown or exit', async () => {
    await import('../../src/index');

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(bootstrapMock).toHaveBeenCalledTimes(1);
    expect(shutdownMock).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
