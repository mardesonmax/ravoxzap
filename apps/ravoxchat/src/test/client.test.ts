import { afterEach, describe, expect, it, vi } from 'vitest';

import { ravoxApi, waitForOperation } from '../api/client';
import type { RavoxChatConfig } from '../types';

const config: RavoxChatConfig = {
  apiBaseUrl: 'http://localhost:3334/',
  apiKey: 'ravox_live_test',
  instanceId: 'inst_123',
};

describe('RavoxChat API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envia Authorization e parseia JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ravoxApi(config, '/ping')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3334/ping', expect.objectContaining({
      headers: expect.any(Headers),
    }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer ravox_live_test');
  });

  it('propaga erro da API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'Payload invalido' }),
    }));

    await expect(ravoxApi(config, '/bad')).rejects.toThrow('Payload invalido');
  });

  it('faz polling de operacao ate sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ operationId: 'op_1', status: 'SUCCESS', result: { done: true }, error: null }),
    }));

    await expect(waitForOperation(config, 'op_1', 1)).resolves.toMatchObject({
      operationId: 'op_1',
      status: 'SUCCESS',
      result: { done: true },
    });
  });
});
