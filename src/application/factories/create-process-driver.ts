import type pino from 'pino';
import { DockerProcessDriver } from '../../adapters/process/docker-process-driver';
import { WindowsProcessDriver } from '../../adapters/process/windows-process-driver';
import type { AppConfig } from '../../shared/config';
import { verifyPalserverPath } from '../../shared/config';
import type { ServerProcessDriver } from '../ports/server-process-driver';

export interface CreateProcessDriverOptions {
  config: AppConfig;
  logger: pino.Logger;
}

export function createProcessDriver({ config, logger }: CreateProcessDriverOptions): ServerProcessDriver {
  if (config.managementMode === 'docker') {
    if (!config.dockerContainerName) {
      throw new Error('Modo docker requer DOCKER_CONTAINER_NAME.');
    }
    return new DockerProcessDriver({ containerName: config.dockerContainerName, logger });
  }

  if (!config.palserverExePath || !config.palserverWorkingDirectory || !config.palserverProcessName) {
    throw new Error('Modo native-windows requer PALSERVER_EXE_PATH, PALSERVER_WORKING_DIRECTORY e PALSERVER_PROCESS_NAME.');
  }

  verifyPalserverPath(config);

  return new WindowsProcessDriver({
    palserverExePath: config.palserverExePath,
    palserverWorkingDirectory: config.palserverWorkingDirectory,
    palserverArguments: config.palserverArguments,
    palserverProcessName: config.palserverProcessName,
    logger,
  });
}
