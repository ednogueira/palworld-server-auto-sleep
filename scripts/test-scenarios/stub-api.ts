import http from 'node:http';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

export interface StubApiOptions {
  port: number;
  username?: string;
  password?: string;
}

export interface SaveBehavior {
  delayMs?: number;
  fail?: boolean;
  failuresBeforeSuccess?: number;
}

export interface ShutdownBehavior {
  delayMs?: number;
  fail?: boolean;
}

export class StubPalworldApi extends EventEmitter {
  private readonly server: http.Server;
  private readonly authHeader: string;
  private readonly state: {
    running: boolean;
    saveCount: number;
    saveAttempts: number;
    saveFailuresLeft: number;
    shutdownPending: boolean;
    playersCount: number;
  };
  private saveBehavior: SaveBehavior = {};
  private shutdownBehavior: ShutdownBehavior = {};

  public constructor(private readonly options: StubApiOptions) {
    super();
    this.authHeader = `Basic ${Buffer.from(
      `${options.username ?? 'admin'}:${options.password ?? 'secret'}`,
      'utf8',
    ).toString('base64')}`;
    this.state = {
      running: true,
      saveCount: 0,
      saveAttempts: 0,
      saveFailuresLeft: 0,
      shutdownPending: false,
      playersCount: 0,
    };

    this.server = http.createServer((req, response) => {
      void this.handle(req, response);
    });
  }

  public setPlayers(count: number): void {
    this.state.playersCount = count;
  }

  public setSaveBehavior(behavior: SaveBehavior): void {
    this.saveBehavior = behavior;
    if (behavior.failuresBeforeSuccess !== undefined) {
      this.state.saveFailuresLeft = behavior.failuresBeforeSuccess;
    }
  }

  public setShutdownBehavior(behavior: ShutdownBehavior): void {
    this.shutdownBehavior = behavior;
  }

  public getSaveCount(): number {
    return this.state.saveCount;
  }

  public getSaveAttempts(): number {
    return this.state.saveAttempts;
  }

  public getSaveFailuresLeft(): number {
    return this.state.saveFailuresLeft;
  }

  public isShutdownPending(): boolean {
    return this.state.shutdownPending;
  }

  public markRunning(running: boolean): void {
    this.state.running = running;
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(this.options.port, () => resolve());
    });
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  public address(): { port: number } {
    const addr = this.server.address();
    if (addr && typeof addr === 'object') {
      return { port: addr.port };
    }
    return { port: this.options.port };
  }

  private async handle(req: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const auth = req.headers['authorization'];
    if (auth !== this.authHeader) {
      response.statusCode = 401;
      response.end('unauthorized');
      return;
    }

    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/v1/api/info') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ version: '1.0.0-stub' }));
      return;
    }

    if (req.method === 'GET' && url === '/v1/api/players') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(
        Array.from({ length: this.state.playersCount }, (_, i) => ({ id: i + 1 })),
      ));
      return;
    }

    if (req.method === 'POST' && url === '/v1/api/save') {
      await this.handleSave(response);
      return;
    }

    if (req.method === 'POST' && url === '/v1/api/shutdown') {
      await this.handleShutdown(response);
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  }

  private async handleSave(response: http.ServerResponse): Promise<void> {
    const delayMs = this.saveBehavior.delayMs ?? 0;
    this.state.saveAttempts += 1;
    if (delayMs > 0) {
      await delay(delayMs);
    }

    if (this.saveBehavior.fail) {
      response.statusCode = 500;
      response.end('save failed');
      this.emit('save:failed');
      return;
    }

    if (this.state.saveFailuresLeft > 0) {
      this.state.saveFailuresLeft -= 1;
      response.statusCode = 500;
      response.end('transient failure');
      this.emit('save:transient');
      return;
    }

    this.state.saveCount += 1;
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true }));
    this.emit('save:ok');
  }

  private async handleShutdown(response: http.ServerResponse): Promise<void> {
    const delayMs = this.shutdownBehavior.delayMs ?? 0;
    this.state.shutdownPending = true;
    if (delayMs > 0) {
      await delay(delayMs);
    }
    if (this.shutdownBehavior.fail) {
      response.statusCode = 500;
      response.end('shutdown failed');
      this.state.shutdownPending = false;
      return;
    }
    this.state.running = false;
    response.statusCode = 200;
    response.end(JSON.stringify({ ok: true }));
    this.state.shutdownPending = false;
    this.emit('shutdown:ok');
  }
}
