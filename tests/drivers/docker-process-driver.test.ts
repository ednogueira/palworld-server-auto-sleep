import { vi, describe, expect, it, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mocks.execFileMock,
  spawn: vi.fn(),
}));

import { promisify } from 'node:util';
import { DockerProcessDriver } from '../../src/adapters/process/docker-process-driver';

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

describe('DockerProcessDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detecta container em execucao', async () => {
    mocks.execFileMock.mockImplementation((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
      cb(null, { stdout: 'true 1234' });
    });

    const driver = new DockerProcessDriver({ containerName: 'palworld-server', logger: createLogger() });
    const snapshot = await driver.getSnapshot();

    expect(snapshot.running).toBe(true);
    expect(snapshot.pids).toEqual([1234]);
  });

  it('detecta container parado', async () => {
    mocks.execFileMock.mockImplementation((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
      cb(null, { stdout: 'false 0' });
    });

    const driver = new DockerProcessDriver({ containerName: 'palworld-server', logger: createLogger() });
    const running = await driver.isRunning();

    expect(running).toBe(false);
  });

  it('inicia container quando parado', async () => {
    mocks.execFileMock
      .mockImplementationOnce((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
        cb(null, { stdout: 'false 0' });
      })
      .mockImplementationOnce((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
        cb(null, { stdout: 'palworld-server' });
      });

    const driver = new DockerProcessDriver({ containerName: 'palworld-server', logger: createLogger() });
    await driver.start();

    expect(mocks.execFileMock).toHaveBeenCalledTimes(2);
    const startCall = mocks.execFileMock.mock.calls[1] as unknown[];
    expect(startCall[0]).toBe('docker');
    expect(startCall[1]).toEqual(['start', 'palworld-server']);
  });

  it('para container quando em execucao', async () => {
    mocks.execFileMock
      .mockImplementationOnce((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
        cb(null, { stdout: 'true 1234' });
      })
      .mockImplementationOnce((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
        cb(null, { stdout: 'palworld-server' });
      });

    const driver = new DockerProcessDriver({ containerName: 'palworld-server', logger: createLogger() });
    await driver.stop();

    expect(mocks.execFileMock).toHaveBeenCalledTimes(2);
    const stopCall = mocks.execFileMock.mock.calls[1] as unknown[];
    expect(stopCall[0]).toBe('docker');
    expect(stopCall[1]).toEqual(['stop', '--time', '240', 'palworld-server']);
  });

  it('respeita stopTimeoutSeconds customizado no docker stop', async () => {
    mocks.execFileMock
      .mockImplementationOnce((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
        cb(null, { stdout: 'true 1234' });
      })
      .mockImplementationOnce((cmd: string, args: string[], cb: (error: Error | null, result?: { stdout: string }) => void) => {
        cb(null, { stdout: 'palworld-server' });
      });

    const driver = new DockerProcessDriver({
      containerName: 'palworld-server',
      logger: createLogger(),
      stopTimeoutSeconds: 120,
    });
    await driver.stop();

    const stopCall = mocks.execFileMock.mock.calls[1] as unknown[];
    expect(stopCall[1]).toEqual(['stop', '--time', '120', 'palworld-server']);
  });
});
