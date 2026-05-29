import { useMutation } from '@tanstack/react-query';
import { Clock, Copy } from 'lucide-react';
import type { ReactNode } from 'react';

import { publicClient, waitForOperation } from '../api/client';
import type { OperationRecord, RavoxChatConfig, WhatsAppOperation } from '../types';
import { createLocalId, stringifyResult } from '../lib/utils';
import { IconButton, JsonResult, Pill } from './ui';

export type RunOperationInput = {
  label: string;
  method: string;
  path: string;
  payload?: unknown;
  wait?: boolean;
  refresh?: () => void;
};

export type RunOperation = (input: RunOperationInput) => Promise<WhatsAppOperation | unknown>;

export function useOperationRunner(config: RavoxChatConfig, onRecord: (record: OperationRecord) => void) {
  return async function runOperation(input: RunOperationInput) {
    const now = new Date().toISOString();
    const recordBase: OperationRecord = {
      id: createLocalId('op'),
      label: input.label,
      method: input.method,
      path: input.path,
      payload: input.payload,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
    };
    onRecord(recordBase);

    try {
      const started = await publicClient.startOperation(config, input.method, input.path, input.payload);
      if (!started || typeof started !== 'object' || !('operationId' in started) || typeof started.operationId !== 'string') {
        onRecord({
          ...recordBase,
          status: 'SUCCESS',
          result: started,
          updatedAt: new Date().toISOString(),
        });
        input.refresh?.();
        return started;
      }
      const queuedRecord: OperationRecord = {
        ...recordBase,
        operationId: started.operationId,
        status: 'RUNNING',
        updatedAt: new Date().toISOString(),
      };
      onRecord(queuedRecord);

      if (input.wait === false) return started;
      const operation = await waitForOperation(config, started.operationId);
      onRecord({
        ...queuedRecord,
        status: operation.status,
        result: operation.result,
        error: operation.error,
        updatedAt: new Date().toISOString(),
      });
      input.refresh?.();
      return operation;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha na operacao.';
      onRecord({ ...recordBase, status: 'FAILED', error: message, updatedAt: new Date().toISOString() });
      throw error;
    }
  };
}

export function OperationButton({ run, input, children, disabled, className = '' }: { run: RunOperation; input: RunOperationInput; children: ReactNode; disabled?: boolean; className?: string }) {
  const mutation = useMutation({ mutationFn: () => run(input) });
  return (
    <div>
      <button type="button" className={`h-10 cursor-pointer rounded-lg bg-[#2edb5c] px-4 text-sm font-medium text-[#0b0c11] transition hover:bg-[#25c452] disabled:cursor-not-allowed disabled:opacity-50 ${className}`} disabled={disabled || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Executando...' : children}
      </button>
      {mutation.error && <p className="mt-2 text-sm text-red-300">{mutation.error.message}</p>}
    </div>
  );
}

export function OperationHistoryPanel({ records, onClear }: { records: OperationRecord[]; onClear: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#2d3036] px-4">
        <div>
          <h2 className="font-semibold">Operacoes</h2>
          <p className="text-xs text-gray-500">Historico local desta instancia</p>
        </div>
        <button type="button" className="h-9 cursor-pointer rounded-lg border border-[#2d3036] px-3 text-sm text-gray-300 hover:bg-[#202221]" onClick={onClear}>Limpar</button>
      </header>
      <div className="ravox-scrollbar min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2d3036] p-6 text-center text-sm text-gray-500">Nenhuma operacao disparada por este navegador.</div>
        ) : records.map(record => (
          <article key={record.id} className="rounded-xl border border-[#2d3036] bg-[#151820] p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm">{record.label}</strong>
                <p className="truncate font-mono text-[11px] text-gray-500">{record.method} {record.path}</p>
              </div>
              <Pill tone={record.status === 'SUCCESS' ? 'good' : record.status === 'FAILED' ? 'bad' : 'warn'}>{record.status}</Pill>
            </div>
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
              <Clock size={13} />
              {new Date(record.updatedAt).toLocaleString('pt-BR')}
              {record.operationId && <IconButton icon={Copy} label="Copiar operationId" onClick={() => void navigator.clipboard?.writeText(record.operationId ?? '')} />}
            </div>
            {record.operationId && <p className="mb-2 truncate font-mono text-xs text-gray-400">{record.operationId}</p>}
            {record.error && <p className="mb-2 rounded-lg bg-red-500/10 p-2 text-sm text-red-200">{record.error}</p>}
            {record.payload !== undefined && <details className="mb-2"><summary className="cursor-pointer text-xs text-gray-400">Payload</summary><JsonResult value={record.payload} /></details>}
            {record.result !== undefined && <details><summary className="cursor-pointer text-xs text-gray-400">Resultado</summary><pre className="ravox-scrollbar max-h-72 overflow-auto rounded-lg bg-[#080a0d] p-3 text-xs leading-5 text-gray-300">{stringifyResult(record.result)}</pre></details>}
          </article>
        ))}
      </div>
    </div>
  );
}
