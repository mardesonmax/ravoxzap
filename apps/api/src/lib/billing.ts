import type {
  BillingPlan,
  BillingPurchase,
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@ravoxzap/database';
import { prisma } from '@ravoxzap/database';

import { AppError } from '../errors/app-error.js';

export const DEFAULT_BILLING_PLAN_CODE = 'ravoxzap_instances_monthly';

export const defaultBillingPlan = {
  code: DEFAULT_BILLING_PLAN_CODE,
  name: 'RavoxZap Instâncias',
  baseMonthlyCents: 5_900,
  includedInstances: 1,
  additionalMonthlyCents: 3_900,
  volumeAdditionalMonthlyCents: 2_900,
  volumeThreshold: 10,
  trialDays: 30,
};

export type BillingPlanValues = typeof defaultBillingPlan;

export function calculateMonthlyAmount(maxInstances: number, plan: BillingPlanValues = defaultBillingPlan) {
  if (!Number.isInteger(maxInstances) || maxInstances < 1) {
    throw new AppError('Quantidade de instâncias inválida.', 400, 'INVALID_INSTANCE_LIMIT');
  }

  const included = Math.max(plan.includedInstances, 1);
  const extraInstances = Math.max(maxInstances - included, 0);
  const standardExtraSlots = Math.max(plan.volumeThreshold - included - 1, 0);
  const standardExtras = Math.min(extraInstances, standardExtraSlots);
  const volumeExtras = Math.max(extraInstances - standardExtras, 0);

  return (
    plan.baseMonthlyCents +
    standardExtras * plan.additionalMonthlyCents +
    volumeExtras * plan.volumeAdditionalMonthlyCents
  );
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSubscriptionBillable(
  subscription: Pick<BillingSubscription, 'status' | 'trialEndsAt' | 'currentPeriodEnd'> | null | undefined,
  now = new Date(),
) {
  if (!subscription) return false;

  if (subscription.status === 'TRIALING') {
    return Boolean(subscription.trialEndsAt && subscription.trialEndsAt >= now);
  }

  if (subscription.status === 'ACTIVE') {
    return !subscription.currentPeriodEnd || subscription.currentPeriodEnd >= now;
  }

  return false;
}

export function subscriptionBlockReason(
  subscription: Pick<BillingSubscription, 'status' | 'trialEndsAt' | 'currentPeriodEnd'> | null | undefined,
  now = new Date(),
) {
  if (!subscription) return 'Nenhuma assinatura ativa encontrada para esta organização.';
  if (subscription.status === 'TRIALING' && subscription.trialEndsAt && subscription.trialEndsAt < now) {
    return 'O período de teste da organização expirou.';
  }
  if (subscription.status === 'ACTIVE' && subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
    return 'A assinatura da organização expirou.';
  }
  if (subscription.status === 'PAST_DUE') return 'A assinatura da organização está com pagamento pendente.';
  if (subscription.status === 'PAUSED') return 'A assinatura da organização está pausada.';
  if (subscription.status === 'CANCELED') return 'A assinatura da organização foi cancelada.';
  return 'A assinatura da organização não permite esta operação.';
}

export async function getOrCreateDefaultBillingPlan() {
  return prisma.billingPlan.upsert({
    where: { code: DEFAULT_BILLING_PLAN_CODE },
    create: defaultBillingPlan,
    update: {
      name: defaultBillingPlan.name,
      baseMonthlyCents: defaultBillingPlan.baseMonthlyCents,
      includedInstances: defaultBillingPlan.includedInstances,
      additionalMonthlyCents: defaultBillingPlan.additionalMonthlyCents,
      volumeAdditionalMonthlyCents: defaultBillingPlan.volumeAdditionalMonthlyCents,
      volumeThreshold: defaultBillingPlan.volumeThreshold,
      trialDays: defaultBillingPlan.trialDays,
      active: true,
    },
  });
}

export async function assertBillableOrganization(organizationId: string) {
  const subscription = await prisma.billingSubscription.findUnique({
    where: { organizationId },
  });

  if (!subscription || !isSubscriptionBillable(subscription)) {
    throw new AppError(subscriptionBlockReason(subscription), 402, 'SUBSCRIPTION_REQUIRED', {
      organizationId,
      status: subscription?.status ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    });
  }

  return subscription;
}

export async function getActiveInstanceCount(organizationId: string) {
  return prisma.whatsAppInstance.count({
    where: { organizationId },
  });
}

export async function assertInstanceSlotAvailable(organizationId: string) {
  const subscription = await assertBillableOrganization(organizationId);
  const activeInstances = await getActiveInstanceCount(organizationId);

  if (activeInstances >= subscription.maxInstances) {
    throw new AppError('Limite de instâncias contratadas atingido.', 402, 'INSTANCE_LIMIT_REACHED', {
      organizationId,
      activeInstances,
      maxInstances: subscription.maxInstances,
    });
  }

  return { subscription, activeInstances };
}

export function publicBillingPlan(plan: BillingPlan) {
  return {
    code: plan.code,
    name: plan.name,
    baseMonthlyCents: plan.baseMonthlyCents,
    includedInstances: plan.includedInstances,
    additionalMonthlyCents: plan.additionalMonthlyCents,
    volumeAdditionalMonthlyCents: plan.volumeAdditionalMonthlyCents,
    volumeThreshold: plan.volumeThreshold,
    trialDays: plan.trialDays,
  };
}

export async function publicBillingSubscription(organizationId: string) {
  const [subscription, activeInstances, pendingPurchase] = await Promise.all([
    prisma.billingSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    }),
    getActiveInstanceCount(organizationId),
    prisma.billingPurchase.findFirst({
      where: { organizationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!subscription) {
    return {
      subscription: null,
      activeInstances,
      canCreateInstance: false,
      blockReason: subscriptionBlockReason(null),
      pendingPurchase: pendingPurchase ? publicBillingPurchase(pendingPurchase) : null,
    };
  }

  const billable = isSubscriptionBillable(subscription);

  return {
    subscription: {
      id: subscription.id,
      organizationId: subscription.organizationId,
      provider: subscription.provider,
      status: subscription.status,
      maxInstances: subscription.maxInstances,
      monthlyAmountCents: subscription.monthlyAmountCents,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      checkoutUrl: subscription.checkoutUrl,
      plan: publicBillingPlan(subscription.plan),
    },
    activeInstances,
    canCreateInstance: billable && activeInstances < subscription.maxInstances,
    blockReason: billable ? null : subscriptionBlockReason(subscription),
    pendingPurchase: pendingPurchase ? publicBillingPurchase(pendingPurchase) : null,
  };
}

export function publicBillingPurchase(purchase: BillingPurchase) {
  return {
    id: purchase.id,
    organizationId: purchase.organizationId,
    subscriptionId: purchase.subscriptionId,
    type: purchase.type,
    status: purchase.status,
    provider: purchase.provider,
    currentMaxInstances: purchase.currentMaxInstances,
    requestedMaxInstances: purchase.requestedMaxInstances,
    amountCents: purchase.amountCents,
    checkoutUrl: purchase.checkoutUrl,
    confirmedAt: purchase.confirmedAt?.toISOString() ?? null,
    expiresAt: purchase.expiresAt?.toISOString() ?? null,
    createdAt: purchase.createdAt.toISOString(),
  };
}

export function mapMercadoPagoStatus(status: string | null | undefined): BillingSubscriptionStatus {
  switch (status) {
    case 'authorized':
    case 'active':
      return 'ACTIVE';
    case 'paused':
      return 'PAUSED';
    case 'cancelled':
    case 'canceled':
      return 'CANCELED';
    case 'pending':
    case 'in_process':
    case 'rejected':
      return 'PAST_DUE';
    default:
      return 'PAST_DUE';
  }
}
