import type { Env } from '@ravoxzap/config';

import { AppError } from '../errors/app-error.js';

type MercadoPagoRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: Record<string, unknown>;
};

export type MercadoPagoPreapprovalPlanResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
};

export type MercadoPagoPreapprovalResponse = {
  id?: string;
  status?: string;
  external_reference?: string;
  init_point?: string;
  sandbox_init_point?: string;
  auto_recurring?: {
    start_date?: string;
    end_date?: string;
  };
};

function assertAccessToken(env: Env) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new AppError('O provedor de cobrança não está configurado.', 503, 'BILLING_PROVIDER_NOT_CONFIGURED');
  }

  return env.MERCADO_PAGO_ACCESS_TOKEN;
}

export function isMercadoPagoConfigured(env: Env) {
  return Boolean(env.MERCADO_PAGO_ACCESS_TOKEN);
}

export async function mercadoPagoRequest<T>(
  env: Env,
  path: string,
  options: MercadoPagoRequestOptions = {},
): Promise<T> {
  const accessToken = assertAccessToken(env);
  const response = await fetch(`${env.MERCADO_PAGO_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError('O provedor de cobrança rejeitou a operação.', 502, 'BILLING_PROVIDER_ERROR', {
      status: response.status,
      payload,
    });
  }

  return payload as T;
}

export async function createMercadoPagoPlan(
  env: Env,
  input: {
    reason: string;
    amountCents: number;
    trialDays: number;
    backUrl: string;
    externalReference: string;
  },
) {
  const freeTrial = input.trialDays > 0
    ? {
        frequency: input.trialDays,
        frequency_type: 'days',
      }
    : undefined;

  return mercadoPagoRequest<MercadoPagoPreapprovalPlanResponse>(env, '/preapproval_plan', {
    method: 'POST',
    body: {
      reason: input.reason,
      external_reference: input.externalReference,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.amountCents / 100,
        currency_id: 'BRL',
        ...(freeTrial ? { free_trial: freeTrial } : {}),
      },
      back_url: input.backUrl,
    },
  });
}

export async function updateMercadoPagoPlanAmount(
  env: Env,
  providerPlanId: string,
  amountCents: number,
) {
  return mercadoPagoRequest<MercadoPagoPreapprovalPlanResponse>(
    env,
    `/preapproval_plan/${encodeURIComponent(providerPlanId)}`,
    {
      method: 'PUT',
      body: {
        auto_recurring: {
          transaction_amount: amountCents / 100,
          currency_id: 'BRL',
        },
      },
    },
  );
}

export async function updateMercadoPagoSubscriptionAmount(
  env: Env,
  providerSubscriptionId: string,
  amountCents: number,
) {
  return mercadoPagoRequest<MercadoPagoPreapprovalResponse>(
    env,
    `/preapproval/${encodeURIComponent(providerSubscriptionId)}`,
    {
      method: 'PUT',
      body: {
        auto_recurring: {
          transaction_amount: amountCents / 100,
          currency_id: 'BRL',
        },
      },
    },
  );
}

export async function getMercadoPagoSubscription(env: Env, providerSubscriptionId: string) {
  return mercadoPagoRequest<MercadoPagoPreapprovalResponse>(
    env,
    `/preapproval/${encodeURIComponent(providerSubscriptionId)}`,
  );
}
