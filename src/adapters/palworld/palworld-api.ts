export class PalworldApiError extends Error {
  public readonly code:
    | 'timeout'
    | 'connection_refused'
    | 'unauthorized'
    | 'bad_request'
    | 'invalid_json'
    | 'http_error'
    | 'unavailable';

  public readonly status?: number;

  public constructor(
    code: PalworldApiError['code'],
    message: string,
    status?: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'PalworldApiError';
    this.code = code;
    this.status = status;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface PalworldApiOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  timeoutMs?: number;
}

export class PalworldApi {
  private readonly baseUrl: string;

  private readonly authHeader: string;

  private readonly timeoutMs: number;

  public constructor(options: PalworldApiOptions) {
    this.baseUrl = `http://${options.host}:${options.port}/v1/api`;
    this.authHeader = `Basic ${Buffer.from(`${options.username}:${options.password}`, 'utf8').toString('base64')}`;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  public async getInfo(): Promise<unknown> {
    return this.request('GET', '/info');
  }

  public async getPlayers(): Promise<unknown> {
    return this.request('GET', '/players');
  }

  public async saveWorld(): Promise<unknown> {
    return this.request('POST', '/save');
  }

  public async shutdown(waittime: number, message: string): Promise<unknown> {
    return this.request('POST', '/shutdown', {
      waittime,
      message,
    });
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const code = response.status === 401
          ? 'unauthorized'
          : response.status === 400
            ? 'bad_request'
            : 'http_error';
        throw new PalworldApiError(code, `Resposta HTTP invalida: ${response.status}`, response.status);
      }

      const text = await response.text();
      if (!text) {
        return null;
      }

      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new PalworldApiError('invalid_json', 'Resposta JSON invalida da API do Palworld.', response.status, error);
      }
    } catch (error) {
      if (error instanceof PalworldApiError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new PalworldApiError('timeout', 'Timeout ao consultar a API do Palworld.', undefined, error);
      }

      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('fetch failed') || message.includes('econnrefused') || message.includes('connection refused')) {
        throw new PalworldApiError('connection_refused', 'Conexao recusada com a API do Palworld.', undefined, error);
      }

      throw new PalworldApiError('unavailable', 'API do Palworld indisponivel.', undefined, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
