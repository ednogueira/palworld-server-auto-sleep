import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type pino from 'pino';
import type { ProcessSnapshot, ServerProcessDriver } from '../../application/ports/server-process-driver';

const execFileAsync = promisify(execFile);

const DEFAULT_STOP_TIMEOUT_SECONDS = 240;

export interface DockerProcessDriverOptions {
  containerName: string;
  logger: pino.Logger;
  stopTimeoutSeconds?: number;
}

export class DockerProcessDriver implements ServerProcessDriver {
  public constructor(private readonly options: DockerProcessDriverOptions) {}

  public async isRunning(): Promise<boolean> {
    const snapshot = await this.getSnapshot();
    return snapshot.running;
  }

  public async getSnapshot(): Promise<ProcessSnapshot> {
    try {
      const { stdout } = await execFileAsync('docker', [
        'inspect',
        '--format',
        '{{.State.Running}} {{.State.Pid}}',
        this.options.containerName,
      ]);
      const trimmed = stdout.trim();
      const [runningStr, pidStr] = trimmed.split(' ');
      if (runningStr === undefined || pidStr === undefined) {
        this.options.logger.debug({ stdout: trimmed }, 'Saida inesperada do docker inspect.');
        return { running: false, pids: [] };
      }
      const running = runningStr === 'true';
      const pid = Number(pidStr);
      return {
        running,
        pids: running && Number.isFinite(pid) && pid > 0 ? [pid] : [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNotFound = message.includes('No such object') || message.includes('not found');
      if (isNotFound) {
        this.options.logger.debug({ container: this.options.containerName }, 'Container nao existe.');
        return { running: false, pids: [] };
      }
      this.options.logger.warn({ error }, 'Falha de comunicacao com Docker daemon. Assumindo container indisponivel.');
      return { running: false, pids: [] };
    }
  }

  public async start(): Promise<void> {
    if (await this.isRunning()) {
      this.options.logger.info('Container Docker ja esta em execucao. Start ignorado.');
      return;
    }

    await execFileAsync('docker', ['start', this.options.containerName]);
    this.options.logger.info(`Container Docker ${this.options.containerName} iniciado.`);
  }

  public async stop(): Promise<void> {
    if (!(await this.isRunning())) {
      this.options.logger.info('Container Docker ja esta parado. Stop ignorado.');
      return;
    }

    const timeoutSeconds = this.options.stopTimeoutSeconds ?? DEFAULT_STOP_TIMEOUT_SECONDS;
    await execFileAsync('docker', ['stop', '--time', String(timeoutSeconds), this.options.containerName]);
    this.options.logger.info(
      { timeoutSeconds },
      `Container Docker ${this.options.containerName} parado (docker stop -t ${timeoutSeconds}).`,
    );
  }
}
