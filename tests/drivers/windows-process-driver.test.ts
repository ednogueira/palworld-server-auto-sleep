import { vi, describe, expect, it, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawnMock,
  execFile: mocks.execFileMock,
}));

import { WindowsProcessDriver } from '../../src/adapters/process/windows-process-driver';

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

function createFakeChild(pid: number): EventEmitter & { pid: number; stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { pid: number; stdout: EventEmitter; stderr: EventEmitter };
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('WindowsProcessDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'win32' });
  });

  it('inicia processo quando nenhum esta rodando', async () => {
    mocks.execFileMock.mockImplementation((cmd: string, args: string[], opts: unknown, cb: (error: Error | null, result?: { stdout: string }) => void) => {
      cb(null, { stdout: '' });
    });

    const child = createFakeChild(1234);
    mocks.spawnMock.mockReturnValue(child);

    const driver = new WindowsProcessDriver({
      palserverExePath: 'C:\\PalServer\\PalServer.exe',
      palserverWorkingDirectory: 'C:\\PalServer',
      palserverArguments: [],
      palserverProcessName: 'PalServer-Win64-Test-Cmd.exe',
      logger: createLogger(),
    });

    const startPromise = driver.start();
    setImmediate(() => child.emit('exit', 0, null));
    await startPromise;

    expect(mocks.spawnMock).toHaveBeenCalledWith(
      'C:\\PalServer\\PalServer.exe',
      [],
      expect.objectContaining({ cwd: 'C:\\PalServer' }),
    );
  });

  it('ignora start quando processo ja esta rodando', async () => {
    mocks.execFileMock.mockImplementation((cmd: string, args: string[], opts: unknown, cb: (error: Error | null, result?: { stdout: string }) => void) => {
      cb(null, { stdout: '"PalServer-Win64-Test-Cmd.exe","1234"' });
    });

    const driver = new WindowsProcessDriver({
      palserverExePath: 'C:\\PalServer\\PalServer.exe',
      palserverWorkingDirectory: 'C:\\PalServer',
      palserverArguments: [],
      palserverProcessName: 'PalServer-Win64-Test-Cmd.exe',
      logger: createLogger(),
    });

    await driver.start();

    expect(mocks.spawnMock).not.toHaveBeenCalled();
  });

  it('detecta processo em execucao', async () => {
    mocks.execFileMock.mockImplementation((cmd: string, args: string[], opts: unknown, cb: (error: Error | null, result?: { stdout: string }) => void) => {
      cb(null, { stdout: '"PalServer-Win64-Test-Cmd.exe","1234"' });
    });

    const driver = new WindowsProcessDriver({
      palserverExePath: 'C:\\PalServer\\PalServer.exe',
      palserverWorkingDirectory: 'C:\\PalServer',
      palserverArguments: [],
      palserverProcessName: 'PalServer-Win64-Test-Cmd.exe',
      logger: createLogger(),
    });

    const running = await driver.isRunning();
    expect(running).toBe(true);
  });
});
