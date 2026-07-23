import type pino from 'pino';
import type { BackupService } from '../../application/ports/backup-service';

export interface NoopBackupServiceOptions {
  logger: pino.Logger;
  reason: string;
}

export class NoopBackupService implements BackupService {
  public constructor(private readonly options: NoopBackupServiceOptions) {}

  public async isBackupRunning(): Promise<boolean> {
    return false;
  }

  public async runBackup(): Promise<never> {
    this.options.logger.warn(
      { reason: this.options.reason },
      'Backup pre-shutdown desabilitado para este modo. Prosseguindo com save direto.',
    );
    throw new Error(this.options.reason);
  }
}
