import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleMonitor } from '../src/application/idle-monitor';
import type { PalworldApi } from '../src/adapters/palworld/palworld-api';
import { StateManager } from '../src/domain/state-manager';

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as any;
}

describe('IdleMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('exige duas leituras zero consecutivas antes de iniciar idle', async () => {
    const getPlayers = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const api = { getPlayers } as unknown as PalworldApi;
    const stateManager = new StateManager('RUNNING');
    const onIdleTimeout = vi.fn().mockResolvedValue(undefined);
    const monitor = new IdleMonitor(api, stateManager, {
      playerCheckIntervalSeconds: 1,
      emptyServerTimeoutMinutes: 1,
      logger: createLogger(),
      onIdleTimeout,
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onIdleTimeout).not.toHaveBeenCalled();
  });

  it('cancela idle quando um jogador entra', async () => {
    const getPlayers = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1 }]);

    const api = { getPlayers } as unknown as PalworldApi;
    const stateManager = new StateManager('RUNNING');
    const onIdleTimeout = vi.fn().mockResolvedValue(undefined);
    const monitor = new IdleMonitor(api, stateManager, {
      playerCheckIntervalSeconds: 1,
      emptyServerTimeoutMinutes: 1,
      logger: createLogger(),
      onIdleTimeout,
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onIdleTimeout).not.toHaveBeenCalled();
    expect(monitor.getLastPlayerSeenAt()).toBeInstanceOf(Date);
  });

  it('dispara timeout de inatividade', async () => {
    const getPlayers = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    const api = { getPlayers } as unknown as PalworldApi;
    const stateManager = new StateManager('RUNNING');
    const onIdleTimeout = vi.fn().mockResolvedValue(undefined);
    const monitor = new IdleMonitor(api, stateManager, {
      playerCheckIntervalSeconds: 1,
      emptyServerTimeoutMinutes: 0,
      logger: createLogger(),
      onIdleTimeout,
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
  });

  it('permite novo idle quando onIdleTimeout falha', async () => {
    let firstCall = true;
    const getPlayers = vi.fn<() => Promise<unknown>>().mockResolvedValue([]);

    const api = { getPlayers } as unknown as PalworldApi;
    const stateManager = new StateManager('RUNNING');
    const onIdleTimeout = vi.fn().mockImplementation(async () => {
      if (firstCall) {
        firstCall = false;
        throw new Error('Falha simulada no desligamento.');
      }
    });
    const logger = createLogger();
    const monitor = new IdleMonitor(api, stateManager, {
      playerCheckIntervalSeconds: 1,
      emptyServerTimeoutMinutes: 0,
      logger,
      onIdleTimeout,
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onIdleTimeout).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalled();
  });

  it('reseta o estado interno ao chamar restart()', async () => {
    const getPlayers = vi.fn<() => Promise<unknown>>().mockResolvedValue([]);
    const api = { getPlayers } as unknown as PalworldApi;
    const stateManager = new StateManager('RUNNING');
    const onIdleTimeout = vi.fn().mockResolvedValue(undefined);
    const monitor = new IdleMonitor(api, stateManager, {
      playerCheckIntervalSeconds: 1,
      emptyServerTimeoutMinutes: 1,
      logger: createLogger(),
      onIdleTimeout,
    });

    monitor.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onIdleTimeout).toHaveBeenCalledTimes(1);

    monitor.restart();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
  });
});
