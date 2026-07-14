import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type pino from 'pino';
import { PalworldApi, PalworldApiError } from './palworld-api';
import { sleep } from './utils/sleep';
import { getProcessSnapshot, isProcessRunning, killProcessByName, killProcessByPid } from './utils/process-utils';

export interface ProcessManagerOptions {
  palserverExePath: string;
  palserverWorkingDirectory: string;
  palserverArguments: string[];
  palserverProcessName: string;
  startupTimeoutSeconds: number;
  shutdownTimeoutSeconds: number;
  logger: pino.Logger;
}

export class ProcessManager {
  private child: ChildProcess | null = null;

  private startupInFlight: Promise<void> | null = null;

  private shutdownInFlight: Promise<void> | null = null;

  public constructor(
    private readonly options: ProcessManagerOptions,
    private readonly api: PalworldApi,
  ) {}

  public async isRunning(): Promise<boolean> {
    return isProcessRunning(this.options.palserverProcessName);
  }

  public async getSnapshot(): Promise<{ running: boolean; pids: number[] }> {
    return getProcessSnapshot(this.options.palserverProcessName);
  }

  public async startServer(): Promise<void> {
    if (this.startupInFlight) {
      return this.startupInFlight;
    }

    this.startupInFlight = this.startServerInternal().finally(() => {
      this.startupInFlight = null;
    });
    return this.startupInFlight;
  }

  public async waitForReady(timeoutSeconds: number): Promise<void> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      try {
        await this.api.getInfo();
        return;
      } catch (error) {
        if (error instanceof PalworldApiError && error.code === 'unauthorized') {
          throw new Error('Credenciais invalidas para a API do Palworld.');
        }
        if (!(await this.isRunning())) {
          throw new Error('Processo do Palworld nao esta mais em execucao.');
        }
        await sleep(5000);
      }
    }
    throw new Error('Tempo excedido aguardando a API do Palworld.');
  }

  public async stopServer(): Promise<void> {
    if (this.shutdownInFlight) {
      return this.shutdownInFlight;
    }

    this.shutdownInFlight = this.stopServerInternal().finally(() => {
      this.shutdownInFlight = null;
    });
    return this.shutdownInFlight;
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

  private async startServerInternal(): Promise<void> {
    const snapshot = await this.getSnapshot();
    if (snapshot.running) {
      this.options.logger.info('PalServer ja esta em execucao. Start ignorado.');
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

    this.options.logger.info({ pid: child.pid }, 'PalServer.exe iniciado');

    const timeout = this.options.startupTimeoutSeconds;
    await this.waitForReady(timeout);
  }

  private async stopServerInternal(): Promise<void> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.running) {
      this.options.logger.info('PalServer ja esta parado. Stop ignorado.');
      return;
    }

    try {
      this.options.logger.info('Salvando mundo antes do desligamento.');
      await this.api.saveWorld();
      await sleep(5000);
      this.options.logger.info('Solicitando desligamento da API do Palworld.');
      await this.api.shutdown(10, 'Servidor vazio. Salvando e desligando automaticamente.');
    } catch (error) {
      this.options.logger.error({ error }, 'Nao foi possivel desligar via API. Tentando taskkill controlado.');
    }

    const deadline = Date.now() + this.options.shutdownTimeoutSeconds * 1000;
    while (Date.now() < deadline) {
      if (!(await this.isRunning())) {
        this.options.logger.info('PalServer encerrou de forma limpa.');
        return;
      }
      await sleep(3000);
    }

    this.options.logger.error('Timeout aguardando encerramento limpo. Tentando taskkill controlado.');
    const currentSnapshot = await this.getSnapshot();
    if (this.child?.pid !== undefined) {
      await killProcessByPid(this.child.pid, false).catch(() => undefined);
      await sleep(2000);
      if (await this.isRunning()) {
        await killProcessByPid(this.child.pid, true).catch(() => undefined);
      }
    } else if (currentSnapshot.pids.length > 0) {
      const firstPid = currentSnapshot.pids[0];
      await killProcessByPid(firstPid, false).catch(() => undefined);
      await sleep(2000);
      if (await this.isRunning()) {
        await killProcessByPid(firstPid, true).catch(() => undefined);
      }
    } else {
      await killProcessByName(this.options.palserverProcessName, true).catch(() => undefined);
    }

    this.options.logger.warn('Encerramento forcado concluido.');
  }
}
