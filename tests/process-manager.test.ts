import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/application/process-manager';
import type { PalworldApi } from '../src/adapters/palworld/palworld-api';
import type { BackupService } from '../src/application/ports/backup-service';
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

function createFakeDriver(initial: { running: boolean; pids?: number[]; stopsAfter?: number } = { running: false }): ServerProcessDriver & { startCalls: number; stopCalls: number; setRunning: (running: boolean) => void; getIsRunningCalls: () => number } {
  let running = initial.running;
  let isRunningCalls = 0;
  const stopsAfter = initial.stopsAfter ?? 0;
  return {
    startCalls: 0,
    stopCalls: 0,
    setRunning: (value: boolean) => {
      running = value;
    },
    getIsRunningCalls: () => isRunningCalls,
    async isRunning() {
      isRunningCalls += 1;
      if (stopsAfter > 0 && isRunningCalls > stopsAfter) {
        return false;
      }
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

function createFakeBackupService(overrides: Partial<BackupService> = {}): BackupService {
  return {
    isBackupRunning: vi.fn().mockResolvedValue(false),
    runBackup: vi.fn().mockResolvedValue({ success: true, durationMs: 1 }),
    ...overrides,
  };
}

function createFakeApi(): PalworldApi {
  return {
    getInfo: vi.fn().mockResolvedValue({ ok: true }),
    saveWorld: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  } as unknown as PalworldApi;
}

const baseOptions = () => ({
  startupTimeoutSeconds: 10,
  shutdownTimeoutSeconds: 10,
  savePostDelaySeconds: 0,
  shutdownApiWaittimeSeconds: 30,
  preShutdownBackupEnabled: false,
  preShutdownBackupMaxWaitSeconds: 60,
  logger: createLogger(),
});

describe('ProcessManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloqueia start duplicado quando o processo ja esta rodando', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true, pids: [1234] });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(baseOptions(), driver, api, backup);

    await manager.startServer();

    expect(driver.startCalls).toBe(0);
    expect(driver.getSnapshot).toBeDefined();
  });

  it('inicia o driver quando o processo nao esta rodando e aguarda API', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: false });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(baseOptions(), driver, api, backup);

    await manager.startServer();

    expect(driver.startCalls).toBe(1);
    expect(api.getInfo).toHaveBeenCalled();
  });

  it('chama shutdown via API e driver.stop como fallback se necessario', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(
      { ...baseOptions(), shutdownTimeoutSeconds: 0 },
      driver,
      api,
      backup,
    );

    const stopPromise = manager.stopServer();
    await vi.advanceTimersByTimeAsync(6_000);
    await stopPromise;

    expect(api.saveWorld).toHaveBeenCalled();
    expect(api.shutdown).toHaveBeenCalled();
    expect(driver.stopCalls).toBe(1);
  }, 15_000);

  it('aguarda o save ser flushado conforme savePostDelaySeconds antes do shutdown', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true, stopsAfter: 2 });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(
      { ...baseOptions(), savePostDelaySeconds: 5, shutdownTimeoutSeconds: 30 },
      driver,
      api,
      backup,
    );

    const order: string[] = [];
    (api.saveWorld as any).mockImplementation(async () => {
      order.push('save');
    });
    (api.shutdown as any).mockImplementation(async () => {
      order.push('shutdown');
    });

    const stopPromise = manager.stopServer();
    await vi.advanceTimersByTimeAsync(60_000);
    await stopPromise;

    expect(order.indexOf('save')).toBeLessThan(order.indexOf('shutdown'));
    expect(api.shutdown).toHaveBeenCalledWith(30, expect.any(String));
  }, 15_000);

  it('aborta o shutdown se o save via API falhar', async () => {
    const api = {
      getInfo: vi.fn().mockResolvedValue({ ok: true }),
      saveWorld: vi.fn().mockRejectedValue(new Error('boom')),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as unknown as PalworldApi;
    const driver = createFakeDriver({ running: true });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(baseOptions(), driver, api, backup);

    await expect(manager.stopServer()).rejects.toThrow('Falha ao salvar o mundo via API');
    expect(api.shutdown).not.toHaveBeenCalled();
    expect(driver.stopCalls).toBe(0);
  });

  it('executa backup pre-shutdown quando habilitado', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true, stopsAfter: 2 });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(
      { ...baseOptions(), preShutdownBackupEnabled: true },
      driver,
      api,
      backup,
    );

    const stopPromise = manager.stopServer();
    await vi.advanceTimersByTimeAsync(15_000);
    await stopPromise;

    expect(backup.runBackup).toHaveBeenCalledTimes(1);
    expect(api.saveWorld).toHaveBeenCalled();
  }, 15_000);

  it('aguarda backup em andamento terminar antes de prosseguir', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true, stopsAfter: 2 });
    let backupCalls = 0;
    const backup: BackupService = {
      isBackupRunning: vi.fn().mockImplementation(async () => {
        backupCalls += 1;
        return backupCalls <= 2;
      }),
      runBackup: vi.fn().mockResolvedValue({ success: true, durationMs: 1 }),
    };
    const manager = new ProcessManager(
      { ...baseOptions(), preShutdownBackupEnabled: true, preShutdownBackupMaxWaitSeconds: 30 },
      driver,
      api,
      backup,
    );

    const stopPromise = manager.stopServer();
    await vi.advanceTimersByTimeAsync(20_000);
    await stopPromise;

    expect(backup.isBackupRunning).toHaveBeenCalled();
    expect(backup.runBackup).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('prossegue com save direto se o backup pre-shutdown falhar', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true, stopsAfter: 2 });
    const backup: BackupService = {
      isBackupRunning: vi.fn().mockResolvedValue(false),
      runBackup: vi.fn().mockResolvedValue({ success: false, durationMs: 1, error: 'falha' }),
    };
    const manager = new ProcessManager(
      { ...baseOptions(), preShutdownBackupEnabled: true },
      driver,
      api,
      backup,
    );

    const stopPromise = manager.stopServer();
    await vi.advanceTimersByTimeAsync(15_000);
    await stopPromise;

    expect(backup.runBackup).toHaveBeenCalled();
    expect(api.saveWorld).toHaveBeenCalled();
  }, 15_000);

  it('aborta o shutdown quando shouldAbort retorna true antes do save', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(baseOptions(), driver, api, backup);

    const shouldAbort = vi.fn().mockResolvedValue(true);

    await expect(manager.stopServer(shouldAbort)).rejects.toThrow('Shutdown abortado');
    expect(api.saveWorld).not.toHaveBeenCalled();
    expect(api.shutdown).not.toHaveBeenCalled();
    expect(driver.stopCalls).toBe(0);
  });

  it('aborta o shutdown durante o delay se shouldAbort muda para true', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(
      { ...baseOptions(), savePostDelaySeconds: 5, shutdownTimeoutSeconds: 30 },
      driver,
      api,
      backup,
    );

    const shouldAbort = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const stopPromise = manager.stopServer(shouldAbort);
    stopPromise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(stopPromise).rejects.toThrow('Shutdown abortado');

    expect(api.saveWorld).toHaveBeenCalled();
    expect(api.shutdown).not.toHaveBeenCalled();
    expect(driver.stopCalls).toBe(0);
  });

  it('prossegue com shutdown quando shouldAbort retorna false', async () => {
    const api = createFakeApi();
    const driver = createFakeDriver({ running: true });
    const backup = createFakeBackupService();
    const manager = new ProcessManager(
      { ...baseOptions(), shutdownTimeoutSeconds: 0 },
      driver,
      api,
      backup,
    );

    const shouldAbort = vi.fn().mockResolvedValue(false);

    const stopPromise = manager.stopServer(shouldAbort);
    await vi.advanceTimersByTimeAsync(6_000);
    await stopPromise;

    expect(api.saveWorld).toHaveBeenCalled();
    expect(api.shutdown).toHaveBeenCalled();
    expect(driver.stopCalls).toBe(1);
  });
});
