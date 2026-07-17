import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type pino from 'pino';
import type { ProcessSnapshot, ServerProcessDriver } from '../../application/ports/server-process-driver';
import { getProcessSnapshot, isProcessRunning, killProcessByName, killProcessByPid } from './windows-process-utils';

export interface WindowsProcessDriverOptions {
  palserverExePath: string;
  palserverWorkingDirectory: string;
  palserverArguments: string[];
  palserverProcessName: string;
  logger: pino.Logger;
}

export class WindowsProcessDriver implements ServerProcessDriver {
  private child: ChildProcess | null = null;

  public constructor(private readonly options: WindowsProcessDriverOptions) {}

  public async isRunning(): Promise<boolean> {
    return isProcessRunning(this.options.palserverProcessName);
  }

  public async getSnapshot(): Promise<ProcessSnapshot> {
    return getProcessSnapshot(this.options.palserverProcessName);
  }

  public async start(): Promise<void> {
    if (await this.isRunning()) {
      this.options.logger.info('PalServer ja esta em execucao. Start ignorado pelo driver.');
      return;
    }

    const child = spawn(this.options.palserverExePath, this.options.palserverArguments, {
      cwd: this.options.palserverWorkingDirectory,
      detached: false,
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.child = child;
    this.attachProcessLogging(child);

    if (child.pid === undefined) {
      throw new Error('Nao foi possivel iniciar o processo do Palworld.');
    }

    this.options.logger.info({ pid: child.pid }, 'PalServer.exe iniciado pelo driver Windows.');
  }

  public async stop(): Promise<void> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.running) {
      this.options.logger.info('PalServer ja esta parado. Stop ignorado pelo driver.');
      return;
    }

    if (this.child?.pid !== undefined) {
      await killProcessByPid(this.child.pid, false).catch(() => undefined);
      await this.waitForTerminationOrForceKill(this.child.pid);
      return;
    }

    if (snapshot.pids.length > 0) {
      const firstPid = snapshot.pids[0];
      await killProcessByPid(firstPid, false).catch(() => undefined);
      await this.waitForTerminationOrForceKill(firstPid);
      return;
    }

    await killProcessByName(this.options.palserverProcessName, true).catch(() => undefined);
  }

  private attachProcessLogging(child: ChildProcess): void {
    child.stdout?.on('data', (chunk: Buffer) => {
      this.options.logger.info({ stream: 'stdout', chunk: chunk.toString('utf8').trim() }, 'PalServer stdout');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.options.logger.error({ stream: 'stderr', chunk: chunk.toString('utf8').trim() }, 'PalServer stderr');
    });
    child.on('exit', (code, signal) => {
      this.options.logger.warn({ code, signal }, 'PalServer encerrou');
    });
  }

  private async waitForTerminationOrForceKill(pid: number, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!(await this.isRunning())) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await killProcessByPid(pid, true).catch(() => undefined);
  }
}
