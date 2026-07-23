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

  public readonly attempt?: number;

  public constructor(
    code: PalworldApiError['code'],
    message: string,
    status?: number,
    cause?: unknown,
    attempt?: number,
  ) {
    super(message);
    this.name = 'PalworldApiError';
    this.code = code;
    this.status = status;
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (attempt !== undefined) {
      this.attempt = attempt;
    }
  }
}

export interface PalworldApiOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  timeoutMs?: number;
  saveTimeoutMs?: number;
  retryOnTimeout?: number;
  logger?: import('pino').Logger;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SAVE_TIMEOUT_MS = 60_000;
const DEFAULT_SAVE_RETRY_ON_TIMEOUT = 1;
const RETRY_BACKOFF_MS = 2_000;

export class PalworldApi {
  private readonly baseUrl: string;

  private readonly authHeader: string;

  private readonly timeoutMs: number;

  private readonly saveTimeoutMs: number;

  private readonly retryOnTimeout: number;

  private readonly logger?: import('pino').Logger;

  public constructor(options: PalworldApiOptions) {
    this.baseUrl = `http://${options.host}:${options.port}/v1/api`;
    this.authHeader = `Basic ${Buffer.from(`${options.username}:${options.password}`, 'utf8').toString('base64')}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.saveTimeoutMs = options.saveTimeoutMs ?? options.timeoutMs ?? DEFAULT_SAVE_TIMEOUT_MS;
    this.retryOnTimeout = options.retryOnTimeout ?? DEFAULT_SAVE_RETRY_ON_TIMEOUT;
    this.logger = options.logger;
  }

  public async getInfo(): Promise<unknown> {
    return this.request('GET', '/info', undefined, this.timeoutMs);
  }

  public async getPlayers(): Promise<unknown> {
    return this.request('GET', '/players', undefined, this.timeoutMs);
  }

  public async saveWorld(): Promise<unknown> {
    return this.requestWithRetry('POST', '/save', undefined, this.saveTimeoutMs, this.retryOnTimeout, 'save');
  }

  public async shutdown(waittime: number, message: string): Promise<unknown> {
    return this.request('POST', '/shutdown', {
      waittime,
      message,
    }, this.saveTimeoutMs);
  }

  private async requestWithRetry(
    method: string,
    path: string,
    body: unknown,
    timeoutMs: number,
    maxRetries: number,
    label: string,
  ): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.request(method, path, body, timeoutMs, attempt + 1);
      } catch (error) {
        lastError = error;
        if (!(error instanceof PalworldApiError) || error.code !== 'timeout' || attempt >= maxRetries) {
          throw error;
        }
        this.logger?.warn(
          { attempt: attempt + 1, maxRetries, label, backoffMs: RETRY_BACKOFF_MS },
          'Timeout na chamada da API do Palworld. Tentando novamente.',
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Falha desconhecida na API do Palworld.');
  }

  private async request(method: string, path: string, body: unknown, timeoutMs?: number, attempt?: number): Promise<unknown> {
    const effectiveTimeout = timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

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
        throw new PalworldApiError(code, `Resposta HTTP invalida: ${response.status}`, response.status, undefined, attempt);
      }

      const text = await response.text();
      if (!text) {
        return null;
      }

      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new PalworldApiError('invalid_json', 'Resposta JSON invalida da API do Palworld.', response.status, error, attempt);
      }
    } catch (error) {
      if (error instanceof PalworldApiError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new PalworldApiError('timeout', `Timeout ao consultar a API do Palworld (${effectiveTimeout}ms).`, undefined, error, attempt);
      }

      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('fetch failed') || message.includes('econnrefused') || message.includes('connection refused')) {
        throw new PalworldApiError('connection_refused', 'Conexao recusada com a API do Palworld.', undefined, error, attempt);
      }

      throw new PalworldApiError('unavailable', 'API do Palworld indisponivel.', undefined, error, attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
}
