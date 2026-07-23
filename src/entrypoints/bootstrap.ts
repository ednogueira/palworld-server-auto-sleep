import { IdleMonitor } from '../application/idle-monitor';
import { ProcessManager } from '../application/process-manager';
import { createBackupService } from '../application/factories/create-backup-service';
import { createProcessDriver } from '../application/factories/create-process-driver';
import type { BackupService } from '../application/ports/backup-service';
import type { ServerProcessDriver } from '../application/ports/server-process-driver';
import { PalworldApi } from '../adapters/palworld/palworld-api';
import { UdpWakeListener } from '../adapters/network/udp-wake-listener';
import { StateManager } from '../domain/state-manager';
import { extractPlayerCount } from '../domain/player-count';
import { loadConfig } from '../shared/config';
import { createLogger } from '../shared/logger';
import { sleep } from '../shared/sleep';

export interface BootstrapDependencies {
  api?: PalworldApi;
  driver?: ServerProcessDriver;
  backupService?: BackupService;
  config?: ReturnType<typeof loadConfig>;
  enableDebugLoop?: boolean;
}

export interface BootstrapResult {
  shutdown: () => Promise<void>;
  stateManager: StateManager;
}

export async function bootstrap(dependencies: BootstrapDependencies = {}): Promise<BootstrapResult> {
  const config = dependencies.config ?? loadConfig();
  const logger = createLogger(config.logLevel);
  const stateManager = new StateManager('STOPPED');
  const api = dependencies.api ?? new PalworldApi({
    host: config.restApiHost,
    port: config.restApiPort,
    username: config.restApiUsername,
    password: config.restApiPassword,
    saveTimeoutMs: config.restApiSaveTimeoutSeconds * 1000,
    logger,
  });

  const driver = dependencies.driver ?? createProcessDriver({ config, logger });
  const backupService = dependencies.backupService ?? createBackupService({ config, logger });
  const processManager = new ProcessManager(
    {
      startupTimeoutSeconds: config.serverStartupTimeoutSeconds,
      shutdownTimeoutSeconds: config.serverShutdownTimeoutSeconds,
      savePostDelaySeconds: config.savePostDelaySeconds,
      shutdownApiWaittimeSeconds: config.shutdownApiWaittimeSeconds,
      preShutdownBackupEnabled: config.preShutdownBackupEnabled,
      preShutdownBackupMaxWaitSeconds: config.preShutdownBackupMaxWaitSeconds,
      logger,
    },
    driver,
    api,
    backupService,
  );

  const wakeListener = new UdpWakeListener({
    host: config.gameHost,
    port: config.gamePort,
    logger,
    onWake: async () => {
      if (!stateManager.transition('STARTING')) {
        return;
      }

      logger.info('[STARTING] Iniciando servidor Palworld');
      try {
        await processManager.startServer();
        stateManager.forceTransition('RUNNING');
        logger.info('[RUNNING] Servidor disponivel');
        idleMonitor.restart();
      } catch (error) {
        logger.error({ error }, 'Falha ao iniciar o PalServer.');
        stateManager.forceTransition('STOPPED');
        await wakeListener.start();
      }
    },
  });

  const idleMonitor = new IdleMonitor(api, stateManager, {
    playerCheckIntervalSeconds: config.playerCheckIntervalSeconds,
    emptyServerTimeoutMinutes: config.emptyServerTimeoutMinutes,
    logger,
    onIdleTimeout: async () => {
      if (!stateManager.transition('STOPPING')) {
        return;
      }
      idleMonitor.stop();
      logger.info('[STOPPING] Salvando mundo');
      try {
        await processManager.stopServer(createAbortCheck());
        stateManager.forceTransition('STOPPED');
        logger.info('[STOPPED] Servidor encerrado');
        await sleep(3000);
        await wakeListener.start();
        logger.info('[STOPPED] Wake listener reativado');
      } catch (error) {
        if (error instanceof Error && error.message === 'Shutdown abortado: jogador entrou durante o processo.') {
          logger.info('Shutdown abortado por entrada de jogador. Retomando monitoramento.');
          stateManager.forceTransition('RUNNING');
          idleMonitor.restart();
          try {
            await wakeListener.close();
          } catch (wakeError) {
            logger.warn({ error: wakeError }, 'Falha ao fechar wake listener apos aborto.');
          }
          return;
        }

        logger.error(
          { error },
          'Shutdown por idle falhou. Restaurando estado para RUNNING e retomando monitoramento.',
        );
        stateManager.forceTransition('RUNNING');
        idleMonitor.restart();
        try {
          await wakeListener.start();
        } catch (wakeError) {
          logger.warn({ error: wakeError }, 'Falha ao reativar wake listener apos erro de idle shutdown.');
        }
      }
    },
  });

  const startMonitoring = (): void => {
    stateManager.forceTransition('RUNNING');
    logger.info('[RUNNING] Servidor disponivel');
    idleMonitor.restart();
  };

  const createAbortCheck = (): (() => Promise<boolean>) => {
    return async (): Promise<boolean> => {
      try {
        const response = await api.getPlayers();
        const count = extractPlayerCount(response);
        const shouldAbort = count !== null && count > 0;
        if (shouldAbort) {
          logger.info({ count }, 'Jogador detectado durante shutdown. Abortando desligamento.');
        }
        return shouldAbort;
      } catch (error) {
        logger.warn({ error }, 'Falha ao verificar jogadores durante shutdown. Prosseguindo.');
        return false;
      }
    };
  };

  const startServerOnBoot = async (): Promise<void> => {
    const running = await processManager.isRunning();
    if (running) {
      logger.info('[RUNNING] Servidor ja estava em execucao.');
      startMonitoring();
      return;
    }

    if (!stateManager.transition('STARTING')) {
      stateManager.forceTransition('STARTING');
    }

    logger.info('[STARTING] Iniciando servidor Palworld no boot');
    try {
      await processManager.startServer();
      startMonitoring();
    } catch (error) {
      logger.error({ error }, 'Falha ao iniciar o PalServer no boot.');
      stateManager.forceTransition('STOPPED');
      await wakeListener.start();
    }
  };

  await startServerOnBoot();

  const pollManualProcess = async (): Promise<void> => {
    try {
      const running = await processManager.isRunning();
      const current = stateManager.getState();

      if (running && current === 'STOPPED') {
        logger.info('[STARTING] Processo detectado manualmente.');
        await wakeListener.close();
        stateManager.forceTransition('STARTING');
        try {
          logger.info('[STARTING] Aguardando REST API');
          await processManager.waitForReady(config.serverStartupTimeoutSeconds);
          stateManager.forceTransition('RUNNING');
          logger.info('[RUNNING] Servidor disponivel');
          idleMonitor.restart();
        } catch (error) {
          logger.error({ error }, 'Processo apareceu, mas a API nao subiu.');
          stateManager.forceTransition('STOPPED');
          await wakeListener.start();
        }
      }

      if (!running && current === 'RUNNING') {
        logger.warn('[STOPPED] Servidor parou inesperadamente.');
        idleMonitor.stop();
        stateManager.forceTransition('STOPPED');
        await wakeListener.start();
      }

      if (!running && current === 'STARTING') {
        stateManager.forceTransition('STOPPED');
        await wakeListener.start();
      }
    } catch (error) {
      logger.error({ error }, 'Falha no monitoramento do processo.');
    }
  };

  const pollHandle = setInterval(() => {
    void pollManualProcess();
  }, 10_000);

  const shutdownServerIfRunning = async (): Promise<void> => {
    const current = stateManager.getState();
    if (current !== 'RUNNING' && current !== 'STARTING') {
      return;
    }
    logger.info({ current }, 'Manager encerrando. Solicitando shutdown gracioso do Palworld.');
    if (stateManager.transition('STOPPING')) {
      idleMonitor.stop();
      try {
        await processManager.stopServer();
        stateManager.forceTransition('STOPPED');
        logger.info('[STOPPED] Servidor encerrado durante shutdown do manager.');
      } catch (error) {
        logger.error({ error }, 'Falha ao encerrar servidor durante shutdown do manager.');
      }
    }
  };

  const shutdown = async (): Promise<void> => {
    clearInterval(pollHandle);
    idleMonitor.stop();
    await wakeListener.close();
    logger.info('Encerramento limpo concluido.');
  };

  const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, 'Sinal recebido. Encerrando manager.');
    await shutdownServerIfRunning();
    await shutdown();
  };

  process.once('SIGINT', () => {
    void handleSignal('SIGINT');
  });
  process.once('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });

  const exitHandler = (): void => {
    idleMonitor.stop();
    void wakeListener.close().catch(() => undefined);
  };
  process.on('exit', exitHandler);

  return {
    stateManager,
    shutdown: async (): Promise<void> => {
      process.removeListener('exit', exitHandler);
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      await shutdownServerIfRunning();
      await shutdown();
    },
  };
}
