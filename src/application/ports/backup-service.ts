export interface BackupResult {
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface BackupService {
  isBackupRunning(): Promise<boolean>;
  runBackup(): Promise<BackupResult>;
}
