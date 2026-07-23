import { vi, describe, expect, it, beforeEach, afterEach, type Mock } from 'vitest';

const fetchMock: Mock = vi.fn();

vi.mocked(globalThis.fetch ?? (() => fetchMock)) as unknown;
(globalThis as unknown as { fetch: Mock }).fetch = fetchMock;

import { PalworldApi, PalworldApiError } from '../src/adapters/palworld/palworld-api';

function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const text = body === null || body === undefined ? '' : JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as any;
}

const baseOptions = (overrides: Record<string, unknown> = {}) => ({
  host: '127.0.0.1',
  port: 8212,
  username: 'admin',
  password: 'secret',
  ...overrides,
});

describe('PalworldApi', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parseia resposta JSON do /players', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{ id: 1 }]));
    const api = new PalworldApi(baseOptions());

    const result = await api.getPlayers();
    expect(result).toEqual([{ id: 1 }]);
  });

  it('trata resposta vazia retornando null', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, { ok: true, status: 200 }));
    const api = new PalworldApi(baseOptions());

    const result = await api.getInfo();
    expect(result).toBeNull();
  });

  it('salva mundo sem retry quando responde de primeira', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
    const api = new PalworldApi(baseOptions());

    await api.saveWorld();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retenta saveWorld apenas em timeout, nao em erro HTTP', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500 }));
    const api = new PalworldApi(baseOptions());

    await expect(api.saveWorld()).rejects.toBeInstanceOf(PalworldApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retenta saveWorld em timeout e sucesso na segunda tentativa', async () => {
    fetchMock
      .mockImplementationOnce(() => {
        const err: any = new DOMException('aborted', 'AbortError');
        throw err;
      })
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const api = new PalworldApi(baseOptions({ retryOnTimeout: 1, saveTimeoutMs: 100 }));
    const promise = api.saveWorld();
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('esgotado o retry, propaga o ultimo erro de timeout', async () => {
    fetchMock.mockImplementation(() => {
      const err: any = new DOMException('aborted', 'AbortError');
      throw err;
    });

    const api = new PalworldApi(baseOptions({ retryOnTimeout: 2, saveTimeoutMs: 100 }));
    const promise = api.saveWorld().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result).toBeInstanceOf(PalworldApiError);
    expect((result as PalworldApiError).code).toBe('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
