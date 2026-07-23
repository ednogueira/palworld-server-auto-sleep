import type pino from 'pino';
import { PalworldApi, PalworldApiError } from '../adapters/palworld/palworld-api';
import type { BackupService } from './ports/backup-service';
import type { ServerProcessDriver } from './ports/server-process-driver';
import { sleep } from '../shared/sleep';

export interface ProcessManagerOptions {
  startupTimeoutSeconds: number;
  shutdownTimeoutSeconds: number;
  savePostDelaySeconds: number;
  shutdownApiWaittimeSeconds: number;
  preShutdownBackupEnabled: boolean;
  preShutdownBackupMaxWaitSeconds: number;
  logger: pino.Logger;
}

export class ProcessManager {
  private startupInFlight: Promise<void> | null = null;

  private shutdownInFlight: Promise<void> | null = null;

  public constructor(
    private readonly options: ProcessManagerOptions,
    private readonly driver: ServerProcessDriver,
    private readonly api: PalworldApi,
    private readonly backupService: BackupService,
  ) {}

  public async isRunning(): Promise<boolean> {
    return this.driver.isRunning();
  }

  public async getSnapshot(): Promise<{ running: boolean; pids: number[] }> {
    return this.driver.getSnapshot();
  }

  public async startServer(): Promise<void> {
    if (this.startupInFlight) {
      return this.startupInFlight;
    }

    this.startupInFlight = this.startServerInternal().finally(() => {
      this.startupInFlight = null;
    });
    return this.startupInFlight;
  }

  public async waitForReady(timeoutSeconds: number): Promise<void> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      try {
        await this.api.getInfo();
        return;
      } catch (error) {
        if (error instanceof PalworldApiError && error.code === 'unauthorized') {
          throw new Error('Credenciais invalidas para a API do Palworld.');
        }
        if (!(await this.isRunning())) {
          throw new Error('Processo do Palworld nao esta mais em execucao.');
        }
        await sleep(5000);
      }
    }
    throw new Error('Tempo excedido aguardando a API do Palworld.');
  }

  public async stopServer(shouldAbort?: () => Promise<boolean>): Promise<void> {
    if (this.shutdownInFlight) {
      return this.shutdownInFlight;
    }

    this.shutdownInFlight = this.stopServerInternal(shouldAbort).finally(() => {
      this.shutdownInFlight = null;
    });
    return this.shutdownInFlight;
  }

  private async startServerInternal(): Promise<void> {
    const snapshot = await this.getSnapshot();
    if (snapshot.running) {
      this.options.logger.info('PalServer ja esta em execucao. Start ignorado.');
      return;
    }

    await this.driver.start();
    await this.waitForReady(this.options.startupTimeoutSeconds);
  }

  private async stopServerInternal(shouldAbort?: () => Promise<boolean>): Promise<void> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.running) {
      this.options.logger.info('PalServer ja esta parado. Stop ignorado.');
      return;
    }

    if (this.options.preShutdownBackupEnabled) {
      try {
        await this.runPreShutdownBackup();
      } catch (error) {
        this.options.logger.error(
          { error },
          'Backup pre-shutdown falhou. Prosseguindo com save direto (risco de perda).',
        );
      }
    }

    if (shouldAbort && await shouldAbort()) {
      throw new Error('Shutdown abortado: jogador entrou durante o processo.');
    }

    this.options.logger.info('Solicitando save via API do Palworld.');
    try {
      await this.api.saveWorld();
      this.options.logger.info('Save concluido. Aguardando flush em disco.');
    } catch (error) {
      this.options.logger.error(
        { error },
        'Falha ao chamar /save. Abortando desligamento para preservar o mundo.',
      );
      throw new Error('Falha ao salvar o mundo via API. Shutdown cancelado.');
    }

    const delayMs = this.options.savePostDelaySeconds * 1000;
    if (delayMs > 0) {
      this.options.logger.info({ delayMs }, 'Aguardando flush do save antes do shutdown.');
      const startedAt = Date.now();
      const checkInterval = 3000;
      while (Date.now() - startedAt < delayMs) {
        await sleep(Math.min(checkInterval, delayMs - (Date.now() - startedAt)));
        if (shouldAbort && await shouldAbort()) {
          throw new Error('Shutdown abortado: jogador entrou durante o processo.');
        }
      }
    }

    try {
      this.options.logger.info('Solicitando desligamento gracioso via API do Palworld.');
      await this.api.shutdown(this.options.shutdownApiWaittimeSeconds, 'Servidor vazio. Salvando e desligando automaticamente.');
    } catch (error) {
      this.options.logger.error({ error }, 'Nao foi possivel desligar via API. Tentando parada controlada pelo driver.');
    }

    const deadline = Date.now() + this.options.shutdownTimeoutSeconds * 1000;
    while (Date.now() < deadline) {
      if (!(await this.isRunning())) {
        this.options.logger.info('PalServer encerrou de forma limpa.');
        return;
      }
      await sleep(3000);
    }

    this.options.logger.warn(
      { timeoutSeconds: this.options.shutdownTimeoutSeconds },
      'Manager atingiu o timeout aguardando o termino cooperativo. Solicitando parada forcada ao driver (SIGTERM via Docker stop).',
    );
    await this.driver.stop();
    this.options.logger.warn('Encerramento forcado concluido (SIGKILL aplicado se exceder stop_grace_period do container).');
  }

  private async runPreShutdownBackup(): Promise<void> {
    const maxWaitMs = this.options.preShutdownBackupMaxWaitSeconds * 1000;
    const pollIntervalMs = 5000;
    const waitedAt = Date.now();

    while (await this.backupService.isBackupRunning()) {
      if (Date.now() - waitedAt >= maxWaitMs) {
        this.options.logger.warn(
          { maxWaitSeconds: this.options.preShutdownBackupMaxWaitSeconds },
          'Backup ainda em andamento apos timeout. Prosseguindo com save direto.',
        );
        return;
      }
      this.options.logger.info('Backup em andamento. Aguardando concluir antes de continuar.');
      await sleep(pollIntervalMs);
    }

    const result = await this.backupService.runBackup();
    if (!result.success) {
      throw new Error(result.error ?? 'Backup pre-shutdown falhou.');
    }
  }
}
