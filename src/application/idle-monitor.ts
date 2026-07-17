import type pino from 'pino';
import type { PalworldApi } from '../adapters/palworld/palworld-api';
import { extractPlayerCount } from '../domain/player-count';
import type { ServerState, StateManager } from '../domain/state-manager';
import { sleep } from '../shared/sleep';

export interface IdleMonitorOptions {
  playerCheckIntervalSeconds: number;
  emptyServerTimeoutMinutes: number;
  logger: pino.Logger;
  onIdleTimeout: () => Promise<void>;
}

export class IdleMonitor {
  private intervalHandle: NodeJS.Timeout | null = null;

  private running = false;

  private zeroStreak = 0;

  private emptySince: number | null = null;

  private idleTriggered = false;

  private lastPlayerSeenAt: Date | null = null;

  public constructor(
    private readonly api: PalworldApi,
    private readonly stateManager: StateManager,
    private readonly options: IdleMonitorOptions,
  ) {}

  public getLastPlayerSeenAt(): Date | null {
    return this.lastPlayerSeenAt;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.tick();
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.options.playerCheckIntervalSeconds * 1000);
  }

  public stop(): void {
    this.running = false;
    this.zeroStreak = 0;
    this.emptySince = null;
    this.idleTriggered = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  public resetAfterStateChange(nextState: ServerState): void {
    if (nextState !== 'RUNNING') {
      this.stop();
    }
  }

  private async tick(): Promise<void> {
    if (!this.running || this.stateManager.getState() !== 'RUNNING' || this.idleTriggered) {
      return;
    }

    let response: unknown;
    try {
      response = await this.api.getPlayers();
    } catch (error) {
      this.options.logger.warn({ error }, 'Leitura de jogadores indisponivel. Nao vou iniciar idle.');
      return;
    }

    const count = extractPlayerCount(response);
    if (count === null) {
      this.options.logger.warn('Formato da resposta de jogadores desconhecido. Idle ignorado.');
      return;
    }

    this.options.logger.info(`Jogadores online: ${count}`);

    if (count > 0) {
      this.lastPlayerSeenAt = new Date();
      this.zeroStreak = 0;
      this.emptySince = null;
      return;
    }

    this.zeroStreak += 1;
    if (this.zeroStreak < 2) {
      return;
    }

    if (this.emptySince === null) {
      this.emptySince = Date.now();
      this.options.logger.info('Servidor vazio confirmado em duas leituras validas consecutivas.');
      return;
    }

    const elapsedMs = Date.now() - this.emptySince;
    const timeoutMs = this.options.emptyServerTimeoutMinutes * 60 * 1000;
    this.options.logger.info(`[IDLE] Servidor vazio ha ${Math.floor(elapsedMs / 1000 / 60)} minutos`);

    if (elapsedMs < timeoutMs) {
      return;
    }

    this.idleTriggered = true;
    await this.options.onIdleTimeout().catch((error) => {
      this.options.logger.error({ error }, 'Falha ao executar desligamento por idle.');
      this.idleTriggered = false;
    });
  }
}
