import type pino from 'pino';
import { PalworldApi, PalworldApiError } from '../adapters/palworld/palworld-api';
import { sleep } from '../shared/sleep';
import type { ServerProcessDriver } from './ports/server-process-driver';

export interface ProcessManagerOptions {
  startupTimeoutSeconds: number;
  shutdownTimeoutSeconds: number;
  logger: pino.Logger;
}

export class ProcessManager {
  private startupInFlight: Promise<void> | null = null;

  private shutdownInFlight: Promise<void> | null = null;

  public constructor(
    private readonly options: ProcessManagerOptions,
    private readonly driver: ServerProcessDriver,
    private readonly api: PalworldApi,
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

  public async stopServer(): Promise<void> {
    if (this.shutdownInFlight) {
      return this.shutdownInFlight;
    }

    this.shutdownInFlight = this.stopServerInternal().finally(() => {
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

  private async stopServerInternal(): Promise<void> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.running) {
      this.options.logger.info('PalServer ja esta parado. Stop ignorado.');
      return;
    }

    try {
      this.options.logger.info('Salvando mundo antes do desligamento.');
      await this.api.saveWorld();
      await sleep(5000);
      this.options.logger.info('Solicitando desligamento da API do Palworld.');
      await this.api.shutdown(10, 'Servidor vazio. Salvando e desligando automaticamente.');
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

    this.options.logger.error('Timeout aguardando encerramento limpo. Tentando parada forcada pelo driver.');
    await this.driver.stop();
    this.options.logger.warn('Encerramento forcado concluido.');
  }
}
