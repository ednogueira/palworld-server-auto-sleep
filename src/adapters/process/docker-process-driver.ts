import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type pino from 'pino';
import type { ProcessSnapshot, ServerProcessDriver } from '../../application/ports/server-process-driver';

const execFileAsync = promisify(execFile);

export interface DockerProcessDriverOptions {
  containerName: string;
  logger: pino.Logger;
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
      const [runningStr, pidStr] = stdout.trim().split(' ');
      const running = runningStr === 'true';
      const pid = Number(pidStr);
      return {
        running,
        pids: running && Number.isFinite(pid) && pid > 0 ? [pid] : [],
      };
    } catch (error) {
      this.options.logger.debug({ error }, 'Falha ao inspecionar container Docker.');
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

    await execFileAsync('docker', ['stop', this.options.containerName]);
    this.options.logger.info(`Container Docker ${this.options.containerName} parado.`);
  }
}
