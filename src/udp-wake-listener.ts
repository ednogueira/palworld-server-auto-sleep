import dgram from 'node:dgram';
import type pino from 'pino';
import { sleep } from './utils/sleep';

export interface WakePacketInfo {
  address: string;
  port: number;
  size: number;
  message: Buffer;
}

export interface UdpWakeListenerOptions {
  host: string;
  port: number;
  logger: pino.Logger;
  onWake: (packet: WakePacketInfo) => Promise<void> | void;
}

export class UdpWakeListener {
  private socket: dgram.Socket | null = null;

  private opening = false;

  private closed = true;

  private wakeInProgress = false;

  public constructor(private readonly options: UdpWakeListenerOptions) {}

  public isListening(): boolean {
    return this.socket !== null && !this.closed;
  }

  public async start(): Promise<void> {
    if (this.isListening() || this.opening) {
      return;
    }

    this.opening = true;
    try {
      this.closed = false;
      await this.bindSocketWithRetry();
    } finally {
      this.opening = false;
    }
  }

  public async close(): Promise<void> {
    this.closed = true;
    this.wakeInProgress = false;

    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;

    await new Promise<void>((resolve) => {
      socket.close(() => resolve());
    });
  }

  private async bindSocketWithRetry(): Promise<void> {
    while (!this.closed) {
      const socket = dgram.createSocket('udp4');
      this.socket = socket;

      await new Promise<void>((resolve, reject) => {
        socket.once('error', async (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            this.options.logger.warn({ error: error.message }, 'Porta UDP em uso, tentando novamente.');
            socket.removeAllListeners();
            socket.close(() => resolve());
            this.socket = null;
            return;
          }
          reject(error);
        });

        socket.on('message', (message, rinfo) => {
          if (this.wakeInProgress || this.closed) {
            return;
          }
          this.wakeInProgress = true;
          void this.handleWake(message, rinfo).finally(() => {
            this.wakeInProgress = false;
          });
        });

        socket.bind(this.options.port, this.options.host, () => {
          this.closed = false;
          this.options.logger.info(`[STOPPED] Wake listener ativo em UDP ${this.options.host}:${this.options.port}`);
          resolve();
        });
      }).catch((error: unknown) => {
        if (this.closed) {
          return;
        }
        this.options.logger.error({ error }, 'Falha ao abrir wake listener.');
        this.socket = null;
      });

      if (this.socket && this.closed) {
        await new Promise<void>((resolve) => {
          this.socket?.close(() => resolve());
        });
        return;
      }

      if (!this.isListening() && !this.closed) {
        await sleep(1000);
      } else {
        return;
      }
    }
  }

  private async handleWake(message: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    this.options.logger.info(`[WAKE] Pacote recebido de ${rinfo.address}:${rinfo.port}`);
    this.options.logger.warn('O primeiro pacote pode ser perdido; o jogador pode precisar tentar novamente.');
    await this.close();
    await this.options.onWake({
      address: rinfo.address,
      port: rinfo.port,
      size: message.length,
      message,
    });
  }
}
