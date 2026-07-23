import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type pino from 'pino';
import type { BackupResult, BackupService } from '../../application/ports/backup-service';

const execFileAsync = promisify(execFile);

export interface DockerBackupServiceOptions {
  containerName: string;
  logger: pino.Logger;
}

export class DockerBackupService implements BackupService {
  public constructor(private readonly options: DockerBackupServiceOptions) {}

  public async isBackupRunning(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('docker', [
        'exec',
        this.options.containerName,
        'pgrep',
        '-x',
        'backup',
      ]);
      return stdout.trim().length > 0;
    } catch (error) {
      this.options.logger.debug({ error }, 'Falha ao verificar se backup esta em andamento.');
      return false;
    }
  }

  public async runBackup(): Promise<BackupResult> {
    const startedAt = Date.now();
    try {
      this.options.logger.info('Iniciando backup pre-shutdown no container Docker.');
      await execFileAsync('docker', ['exec', this.options.containerName, 'backup']);
      const durationMs = Date.now() - startedAt;
      this.options.logger.info({ durationMs }, 'Backup pre-shutdown concluido com sucesso.');
      return { success: true, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.error({ error, durationMs }, 'Falha ao executar backup pre-shutdown.');
      return { success: false, durationMs, error: message };
    }
  }
}
