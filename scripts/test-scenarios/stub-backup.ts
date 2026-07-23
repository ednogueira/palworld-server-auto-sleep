import type { BackupService, BackupResult } from '../../src/application/ports/backup-service';

export class StubBackupService implements BackupService {
  public runBackupCalls = 0;

  public fail = false;

  public async isBackupRunning(): Promise<boolean> {
    return false;
  }

  public async runBackup(): Promise<BackupResult> {
    this.runBackupCalls += 1;
    if (this.fail) {
      return { success: false, durationMs: 1, error: 'stub failure' };
    }
    return { success: true, durationMs: 1 };
  }
}
