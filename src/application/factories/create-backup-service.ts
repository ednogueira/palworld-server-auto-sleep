import type pino from 'pino';
import { DockerBackupService } from '../../adapters/backup/docker-backup-service';
import { NoopBackupService } from '../../adapters/backup/noop-backup-service';
import type { AppConfig } from '../../shared/config';
import type { BackupService } from '../ports/backup-service';

export interface CreateBackupServiceOptions {
  config: AppConfig;
  logger: pino.Logger;
}

export function createBackupService({ config, logger }: CreateBackupServiceOptions): BackupService {
  if (!config.preShutdownBackupEnabled) {
    return new NoopBackupService({ logger, reason: 'PRE_SHUTDOWN_BACKUP_ENABLED=false' });
  }

  if (config.managementMode === 'docker') {
    if (!config.dockerContainerName) {
      return new NoopBackupService({ logger, reason: 'Modo docker sem DOCKER_CONTAINER_NAME.' });
    }
    return new DockerBackupService({ containerName: config.dockerContainerName, logger });
  }

  return new NoopBackupService({ logger, reason: 'Backup pre-shutdown nao implementado para native-windows.' });
}
