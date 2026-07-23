import type { ServerProcessDriver, ProcessSnapshot } from '../../src/application/ports/server-process-driver';
import type { StubPalworldApi } from './stub-api';

export class StubProcessDriver implements ServerProcessDriver {
  public startCalls = 0;

  public stopCalls = 0;

  public releaseAfterShutdownMs = 0;

  public constructor(public readonly stubApi: StubPalworldApi) {
    this.stubApi.on('shutdown:ok', (): void => {
      this.scheduleRelease();
    });
  }

  private running = false;

  private releaseTimer: NodeJS.Timeout | null = null;

  public async isRunning(): Promise<boolean> {
    return this.running;
  }

  public async getSnapshot(): Promise<ProcessSnapshot> {
    return {
      running: this.running,
      pids: this.running ? [99999] : [],
    };
  }

  public async start(): Promise<void> {
    this.startCalls += 1;
    this.running = true;
  }

  public async stop(): Promise<void> {
    this.stopCalls += 1;
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.running = false;
  }

  public simulateRunning(value: boolean): void {
    this.running = value;
  }

  private scheduleRelease(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
    }
    if (this.releaseAfterShutdownMs > 0) {
      this.releaseTimer = setTimeout(() => {
        this.running = false;
      }, this.releaseAfterShutdownMs);
    } else {
      this.running = false;
    }
  }
}
