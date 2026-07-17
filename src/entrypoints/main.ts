import 'dotenv/config';
import { IdleMonitor } from '../application/idle-monitor';
import { ProcessManager } from '../application/process-manager';
import { createProcessDriver } from '../application/factories/create-process-driver';
import { PalworldApi } from '../adapters/palworld/palworld-api';
import { UdpWakeListener } from '../adapters/network/udp-wake-listener';
import { StateManager } from '../domain/state-manager';
import { loadConfig } from '../shared/config';
import { createLogger } from '../shared/logger';
import { sleep } from '../shared/sleep';

export async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const stateManager = new StateManager('STOPPED');
  const api = new PalworldApi({
    host: config.restApiHost,
    port: config.restApiPort,
    username: config.restApiUsername,
    password: config.restApiPassword,
  });

  const driver = createProcessDriver({ config, logger });
  const processManager = new ProcessManager(
    {
      startupTimeoutSeconds: config.serverStartupTimeoutSeconds,
      shutdownTimeoutSeconds: config.serverShutdownTimeoutSeconds,
      logger,
    },
    driver,
    api,
  );

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
      await processManager.stopServer();
      stateManager.forceTransition('STOPPED');
      logger.info('[STOPPED] Servidor encerrado');
      await sleep(3000);
      await wakeListener.start();
      logger.info('[STOPPED] Wake listener reativado');
    },
  });

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
        idleMonitor.start();
      } catch (error) {
        logger.error({ error }, 'Falha ao iniciar o PalServer.');
        stateManager.forceTransition('STOPPED');
        await wakeListener.start();
      }
    },
  });

  const startMonitoring = (): void => {
    stateManager.forceTransition('RUNNING');
    logger.info('[RUNNING] Servidor disponivel');
    idleMonitor.start();
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
          idleMonitor.start();
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

  const shutdown = async (): Promise<void> => {
    clearInterval(pollHandle);
    idleMonitor.stop();
    await wakeListener.close();
    logger.info('Encerramento limpo concluido.');
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.on('exit', () => {
    idleMonitor.stop();
  });
}
