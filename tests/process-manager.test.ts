import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/application/process-manager';
import type { PalworldApi } from '../src/adapters/palworld/palworld-api';
import type { ServerProcessDriver } from '../src/application/ports/server-process-driver';

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

function createFakeDriver(initial: { running: boolean; pids?: number[] } = { running: false }): ServerProcessDriver & { startCalls: number; stopCalls: number } {
  let running = initial.running;
  return {
    startCalls: 0,
    stopCalls: 0,
    async isRunning() {
      return running;
    },
    async getSnapshot() {
      return { running, pids: initial.pids ?? (running ? [1234] : []) };
    },
    async start() {
      this.startCalls += 1;
      running = true;
    },
    async stop() {
      this.stopCalls += 1;
      running = false;
    },
  };
}

describe('ProcessManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloqueia start duplicado quando o processo ja esta rodando', async () => {
    const api = {
      getInfo: vi.fn().mockResolvedValue({ ok: true }),
      saveWorld: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as PalworldApi;

    const driver = createFakeDriver({ running: true, pids: [1234] });
    const manager = new ProcessManager(
      {
        startupTimeoutSeconds: 10,
        shutdownTimeoutSeconds: 10,
        logger: createLogger(),
      },
      driver,
      api,
    );

    await manager.startServer();

    expect(driver.startCalls).toBe(0);
    expect(driver.getSnapshot).toBeDefined();
  });

  it('inicia o driver quando o processo nao esta rodando e aguarda API', async () => {
    const api = {
      getInfo: vi.fn().mockResolvedValue({ ok: true }),
      saveWorld: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as PalworldApi;

    const driver = createFakeDriver({ running: false });
    const manager = new ProcessManager(
      {
        startupTimeoutSeconds: 10,
        shutdownTimeoutSeconds: 10,
        logger: createLogger(),
      },
      driver,
      api,
    );

    await manager.startServer();

    expect(driver.startCalls).toBe(1);
    expect(api.getInfo).toHaveBeenCalled();
  });

  it('chama shutdown via API e driver.stop como fallback se necessario', async () => {
    const api = {
      getInfo: vi.fn().mockResolvedValue({ ok: true }),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as unknown as PalworldApi;

    const driver = createFakeDriver({ running: true });
    const manager = new ProcessManager(
      {
        startupTimeoutSeconds: 10,
        shutdownTimeoutSeconds: 0,
        logger: createLogger(),
      },
      driver,
      api,
    );

    const stopPromise = manager.stopServer();
    await vi.advanceTimersByTimeAsync(6000);
    await stopPromise;

    expect(api.saveWorld).toHaveBeenCalled();
    expect(api.shutdown).toHaveBeenCalled();
    expect(driver.stopCalls).toBe(1);
  });
});
