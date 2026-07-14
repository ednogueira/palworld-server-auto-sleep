import { vi, describe, expect, it, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  isProcessRunningMock: vi.fn(),
  getProcessSnapshotMock: vi.fn(),
  killProcessByPidMock: vi.fn(),
  killProcessByNameMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawnMock,
}));

vi.mock('../src/utils/process-utils', () => ({
  isProcessRunning: mocks.isProcessRunningMock,
  getProcessSnapshot: mocks.getProcessSnapshotMock,
  killProcessByPid: mocks.killProcessByPidMock,
  killProcessByName: mocks.killProcessByNameMock,
}));

import { PalworldApi } from '../src/palworld-api';
import { ProcessManager } from '../src/process-manager';

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

describe('ProcessManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isProcessRunningMock.mockResolvedValue(true);
    mocks.getProcessSnapshotMock.mockResolvedValue({ running: true, pids: [1234] });
    mocks.killProcessByPidMock.mockResolvedValue(undefined);
    mocks.killProcessByNameMock.mockResolvedValue(undefined);
  });

  it('bloqueia start duplicado quando o processo ja esta rodando', async () => {
    const api = {
      getInfo: vi.fn().mockResolvedValue({ ok: true }),
      saveWorld: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as PalworldApi;

    const manager = new ProcessManager(
      {
        palserverExePath: 'C:\\PalServer\\PalServer.exe',
        palserverWorkingDirectory: 'C:\\PalServer',
        palserverArguments: [],
        palserverProcessName: 'PalServer-Win64-Test-Cmd.exe',
        startupTimeoutSeconds: 10,
        shutdownTimeoutSeconds: 10,
        logger: createLogger(),
      },
      api,
    );

    await manager.startServer();

    expect(mocks.spawnMock).not.toHaveBeenCalled();
    expect(mocks.getProcessSnapshotMock).toHaveBeenCalled();
  });
});
