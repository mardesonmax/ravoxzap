import { describe, expect, it } from 'vitest';

import {
  calculateMonthlyAmount,
  isSubscriptionBillable,
  mapMercadoPagoStatus,
  publicBillingPurchase,
} from './billing.js';

describe('billing helpers', () => {
  it('calculates monthly instance pricing with the volume tier', () => {
    expect(calculateMonthlyAmount(1)).toBe(5_900);
    expect(calculateMonthlyAmount(2)).toBe(9_800);
    expect(calculateMonthlyAmount(9)).toBe(37_100);
    expect(calculateMonthlyAmount(10)).toBe(40_000);
  });

  it('allows only active subscriptions and non-expired trials', () => {
    const now = new Date('2026-05-30T12:00:00.000Z');

    expect(isSubscriptionBillable({ status: 'TRIALING', trialEndsAt: new Date('2026-05-31T12:00:00.000Z'), currentPeriodEnd: null }, now)).toBe(true);
    expect(isSubscriptionBillable({ status: 'TRIALING', trialEndsAt: new Date('2026-05-29T12:00:00.000Z'), currentPeriodEnd: null }, now)).toBe(false);
    expect(isSubscriptionBillable({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(true);
    expect(isSubscriptionBillable({ status: 'PAST_DUE', trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(false);
  });

  it('maps Mercado Pago subscription statuses', () => {
    expect(mapMercadoPagoStatus('authorized')).toBe('ACTIVE');
    expect(mapMercadoPagoStatus('paused')).toBe('PAUSED');
    expect(mapMercadoPagoStatus('cancelled')).toBe('CANCELED');
    expect(mapMercadoPagoStatus('pending')).toBe('PAST_DUE');
  });

  it('serializes pending slot purchases without exposing provider internals', () => {
    const purchase = publicBillingPurchase({
      id: 'purchase_1',
      organizationId: 'org_1',
      subscriptionId: 'sub_1',
      type: 'INSTANCE_SLOT_UPGRADE',
      status: 'PENDING',
      provider: 'MERCADO_PAGO',
      currentMaxInstances: 1,
      requestedMaxInstances: 3,
      amountCents: calculateMonthlyAmount(3),
      providerReference: 'provider_plan_1',
      checkoutUrl: 'https://checkout.test',
      confirmedAt: null,
      expiresAt: new Date('2026-05-31T12:00:00.000Z'),
      createdAt: new Date('2026-05-30T12:00:00.000Z'),
      updatedAt: new Date('2026-05-30T12:00:00.000Z'),
    });

    expect(purchase).toMatchObject({
      id: 'purchase_1',
      status: 'PENDING',
      currentMaxInstances: 1,
      requestedMaxInstances: 3,
      amountCents: 13_700,
      checkoutUrl: 'https://checkout.test',
      confirmedAt: null,
      expiresAt: '2026-05-31T12:00:00.000Z',
    });
    expect('providerReference' in purchase).toBe(false);
  });
});
