import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import type { Env } from '@ravoxzap/config';
import { prisma } from '@ravoxzap/database';
import {
  billingCheckoutSchema,
  billingInstanceSlotsCheckoutSchema,
  billingSubscriptionQuerySchema,
} from '@ravoxzap/shared';

import { AppError } from '../../errors/app-error.js';
import { assertOrganizationAccess, getCurrentUser } from '../../lib/auth.js';
import {
  addDays,
  calculateMonthlyAmount,
  defaultBillingPlan,
  getOrCreateDefaultBillingPlan,
  mapMercadoPagoStatus,
  publicBillingPurchase,
  publicBillingPlan,
  publicBillingSubscription,
} from '../../lib/billing.js';
import {
  createMercadoPagoPlan,
  getMercadoPagoSubscription,
  isMercadoPagoConfigured,
} from '../../lib/mercado-pago.js';

function parseBody<TSchema extends z.ZodTypeAny>(request: FastifyRequest, schema: TSchema): z.infer<TSchema> {
  return schema.parse(request.body);
}

function parseQuery<TSchema extends z.ZodTypeAny>(request: FastifyRequest, schema: TSchema): z.infer<TSchema> {
  return schema.parse(request.query);
}

async function createDevApprovedPurchase(input: {
  organizationId: string;
  type: 'INITIAL_SUBSCRIPTION' | 'INSTANCE_SLOT_UPGRADE';
  currentMaxInstances: number;
  requestedMaxInstances: number;
  amountCents: number;
  planId: string;
  trialDays: number;
  checkoutUrl: string;
}) {
  const now = new Date();
  const trialEndsAt = addDays(now, input.trialDays);

  const subscription = await prisma.billingSubscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      planId: input.planId,
      status: 'TRIALING',
      maxInstances: input.requestedMaxInstances,
      monthlyAmountCents: input.amountCents,
      trialEndsAt,
      checkoutUrl: input.checkoutUrl,
    },
    update: {
      planId: input.planId,
      status: 'TRIALING',
      maxInstances: input.requestedMaxInstances,
      monthlyAmountCents: input.amountCents,
      trialEndsAt,
      checkoutUrl: input.checkoutUrl,
    },
  });

  const purchase = await prisma.billingPurchase.create({
    data: {
      organizationId: input.organizationId,
      subscriptionId: subscription.id,
      type: input.type,
      status: 'PAID',
      currentMaxInstances: input.currentMaxInstances,
      requestedMaxInstances: input.requestedMaxInstances,
      amountCents: input.amountCents,
      checkoutUrl: input.checkoutUrl,
      confirmedAt: now,
    },
  });

  return { purchase, subscription };
}

async function createBillingCheckout(input: {
  env: Env;
  organizationId: string;
  requestedMaxInstances: number;
  backUrl: string;
}) {
  const plan = await getOrCreateDefaultBillingPlan();
  const subscription = await prisma.billingSubscription.findUnique({
    where: { organizationId: input.organizationId },
    include: { plan: true },
  });
  const currentMaxInstances = subscription?.maxInstances ?? 0;

  if (input.requestedMaxInstances < 1) {
    throw new AppError('Quantidade de instâncias inválida.', 400, 'INVALID_INSTANCE_LIMIT');
  }

  if (subscription && input.requestedMaxInstances <= currentMaxInstances) {
    return publicBillingSubscription(input.organizationId);
  }

  const amountCents = calculateMonthlyAmount(input.requestedMaxInstances, plan);
  const type = subscription ? 'INSTANCE_SLOT_UPGRADE' : 'INITIAL_SUBSCRIPTION';

  await prisma.billingPurchase.updateMany({
    where: { organizationId: input.organizationId, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });

  if (!isMercadoPagoConfigured(input.env)) {
    if (input.env.NODE_ENV === 'production') {
      throw new AppError('O provedor de cobrança não está configurado.', 503, 'BILLING_PROVIDER_NOT_CONFIGURED');
    }

    await createDevApprovedPurchase({
      organizationId: input.organizationId,
      type,
      currentMaxInstances,
      requestedMaxInstances: input.requestedMaxInstances,
      amountCents,
      planId: plan.id,
      trialDays: plan.trialDays,
      checkoutUrl: `${input.env.WEB_BASE_URL}/dashboard/instances?billing=dev-approved`,
    });

    return publicBillingSubscription(input.organizationId);
  }

  const purchase = await prisma.billingPurchase.create({
    data: {
      organizationId: input.organizationId,
      subscriptionId: subscription?.id,
      type,
      status: 'PENDING',
      currentMaxInstances,
      requestedMaxInstances: input.requestedMaxInstances,
      amountCents,
      expiresAt: addDays(new Date(), 1),
    },
  });

  const providerPlan = await createMercadoPagoPlan(input.env, {
    reason: `${plan.name} - ${input.requestedMaxInstances} instância${input.requestedMaxInstances === 1 ? '' : 's'}`,
    amountCents,
    trialDays: subscription ? 0 : plan.trialDays,
    backUrl: input.backUrl,
    externalReference: purchase.id,
  }).catch(async error => {
    await prisma.billingPurchase.update({
      where: { id: purchase.id },
      data: { status: 'FAILED' },
    });
    throw error;
  });

  const checkoutUrl = providerPlan.init_point ?? providerPlan.sandbox_init_point ?? null;

  if (!providerPlan.id || !checkoutUrl) {
    await prisma.billingPurchase.update({
      where: { id: purchase.id },
      data: { status: 'FAILED' },
    });
    throw new AppError('O provedor de cobrança não retornou um link de pagamento.', 502, 'BILLING_PROVIDER_ERROR', providerPlan);
  }

  await prisma.billingPurchase.update({
    where: { id: purchase.id },
    data: {
      providerReference: providerPlan.id,
      checkoutUrl,
    },
  });

  if (!subscription) {
    await prisma.billingSubscription.create({
      data: {
        organizationId: input.organizationId,
        planId: plan.id,
        status: 'PAUSED',
        maxInstances: input.requestedMaxInstances,
        monthlyAmountCents: amountCents,
        trialEndsAt: addDays(new Date(), plan.trialDays),
        providerPlanId: providerPlan.id,
        checkoutUrl,
      },
    });
  }

  await prisma.billingWebhookEvent.create({
    data: {
      providerEventId: `checkout:${purchase.id}:${providerPlan.id}`,
      eventType: 'checkout.created',
      payload: {
        providerPlan,
        organizationId: input.organizationId,
        purchaseId: purchase.id,
        requestedMaxInstances: input.requestedMaxInstances,
      },
    },
  }).catch(() => undefined);

  return publicBillingSubscription(input.organizationId);
}

async function applyPaidPurchase(input: {
  purchaseId: string;
  providerSubscriptionId: string;
  providerPlanId?: string | null;
  checkoutUrl?: string | null;
  providerStatus?: string | null;
  currentPeriodEnd?: Date | null;
}) {
  const purchase = await prisma.billingPurchase.findUnique({
    where: { id: input.purchaseId },
  });

  if (!purchase || purchase.status === 'PAID') return purchase;
  if (purchase.status !== 'PENDING') return purchase;

  const plan = await getOrCreateDefaultBillingPlan();
  const now = new Date();
  const trialEndsAt = addDays(now, plan.trialDays);
  const providerStatus = mapMercadoPagoStatus(input.providerStatus);
  const status = providerStatus === 'ACTIVE' && purchase.type === 'INITIAL_SUBSCRIPTION' ? 'TRIALING' : providerStatus;

  const subscription = await prisma.billingSubscription.upsert({
    where: { organizationId: purchase.organizationId },
    create: {
      organizationId: purchase.organizationId,
      planId: plan.id,
      status,
      maxInstances: purchase.requestedMaxInstances,
      monthlyAmountCents: purchase.amountCents,
      trialEndsAt,
      currentPeriodEnd: input.currentPeriodEnd,
      providerPlanId: input.providerPlanId ?? purchase.providerReference,
      providerSubscriptionId: input.providerSubscriptionId,
      checkoutUrl: input.checkoutUrl,
    },
    update: {
      planId: plan.id,
      status,
      maxInstances: purchase.requestedMaxInstances,
      monthlyAmountCents: purchase.amountCents,
      trialEndsAt: purchase.type === 'INITIAL_SUBSCRIPTION' ? trialEndsAt : undefined,
      currentPeriodEnd: input.currentPeriodEnd,
      providerPlanId: input.providerPlanId ?? purchase.providerReference,
      providerSubscriptionId: input.providerSubscriptionId,
      checkoutUrl: input.checkoutUrl,
    },
  });

  return prisma.billingPurchase.update({
    where: { id: purchase.id },
    data: {
      status: 'PAID',
      subscriptionId: subscription.id,
      confirmedAt: now,
    },
  });
}

export function registerBillingRoutes(app: FastifyInstance, env: Env) {
  app.get('/billing/plans', async () => {
    const plan = await getOrCreateDefaultBillingPlan();

    return {
      plans: [publicBillingPlan(plan)],
      recommendedPlanCode: plan.code,
    };
  });

  app.get('/billing/subscription', async request => {
    const user = await getCurrentUser(request);
    const query = parseQuery(request, billingSubscriptionQuerySchema);
    const organizationId = query.organizationId ?? user.memberships[0]?.organizationId;

    if (!organizationId) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    await assertOrganizationAccess(request, organizationId);
    return publicBillingSubscription(organizationId);
  });

  app.post('/billing/checkout', async request => {
    const data = parseBody(request, billingCheckoutSchema);
    await assertOrganizationAccess(request, data.organizationId, ['OWNER', 'ADMIN']);

    return createBillingCheckout({
      env,
      organizationId: data.organizationId,
      requestedMaxInstances: data.maxInstances,
      backUrl: `${env.WEB_BASE_URL}/dashboard/instances`,
    });
  });

  app.post('/billing/instance-slots/checkout', async request => {
    const data = parseBody(request, billingInstanceSlotsCheckoutSchema);
    await assertOrganizationAccess(request, data.organizationId, ['OWNER', 'ADMIN']);
    const subscription = await prisma.billingSubscription.findUnique({
      where: { organizationId: data.organizationId },
    });
    const currentMaxInstances = subscription?.maxInstances ?? 0;
    const requestedMaxInstances = Math.max(currentMaxInstances, 0) + data.additionalInstances;

    return createBillingCheckout({
      env,
      organizationId: data.organizationId,
      requestedMaxInstances,
      backUrl: `${env.WEB_BASE_URL}/dashboard/instances?purchase=slots`,
    });
  });

  app.post('/billing/change-instance-limit', async () => {
    throw new AppError(
      'Alteração direta de limite foi desativada. Use o checkout de slots.',
      410,
      'DIRECT_INSTANCE_LIMIT_CHANGE_DISABLED',
    );
  });

  app.get('/billing/purchases', async request => {
    const user = await getCurrentUser(request);
    const query = parseQuery(request, billingSubscriptionQuerySchema);
    const organizationId = query.organizationId ?? user.memberships[0]?.organizationId;

    if (!organizationId) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    await assertOrganizationAccess(request, organizationId);
    const purchases = await prisma.billingPurchase.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { purchases: purchases.map(publicBillingPurchase) };
  });

  app.get('/billing/purchases/:id', async request => {
    const user = await getCurrentUser(request);
    const params = request.params as { id?: string };
    const purchase = await prisma.billingPurchase.findUnique({
      where: { id: params.id ?? '' },
    });

    if (!purchase) throw new AppError('Compra não encontrada.', 404, 'BILLING_PURCHASE_NOT_FOUND');
    if (!user.memberships.some(member => member.organizationId === purchase.organizationId)) {
      throw new AppError('Organization access denied', 403, 'ORGANIZATION_ACCESS_DENIED');
    }

    return { purchase: publicBillingPurchase(purchase) };
  });

  app.post('/billing/webhooks/mercadopago', async request => {
    const payload = (request.body ?? {}) as {
      id?: string | number;
      type?: string;
      action?: string;
      data?: { id?: string | number };
    };
    const providerObjectId = payload.data?.id ? String(payload.data.id) : undefined;
    const eventType = payload.type ?? payload.action ?? 'mercadopago.webhook';
    const providerEventId = payload.id
      ? String(payload.id)
      : `${eventType}:${providerObjectId ?? randomUUID()}`;

    const event = await prisma.billingWebhookEvent.create({
      data: {
        providerEventId,
        eventType,
        payload: JSON.parse(JSON.stringify(payload)),
      },
    }).catch(error => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return null;
      throw error;
    });

    if (!event) return { received: true, duplicate: true };
    if (!providerObjectId || !isMercadoPagoConfigured(env)) {
      await prisma.billingWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
      return { received: true };
    }

    const providerSubscription = await getMercadoPagoSubscription(env, providerObjectId).catch(() => null);
    const externalReference = providerSubscription?.external_reference;
    const providerStatus = mapMercadoPagoStatus(providerSubscription?.status);
    const checkoutUrl = providerSubscription?.init_point ?? providerSubscription?.sandbox_init_point ?? null;
    const currentPeriodEnd = providerSubscription?.auto_recurring?.end_date
      ? new Date(providerSubscription.auto_recurring.end_date)
      : null;

    const purchase = externalReference
      ? await prisma.billingPurchase.findUnique({ where: { id: externalReference } })
      : await prisma.billingPurchase.findFirst({ where: { providerReference: providerObjectId } });

    if (purchase && providerSubscription) {
      let processedPurchase = purchase;

      if (providerStatus === 'ACTIVE') {
        processedPurchase = await applyPaidPurchase({
          purchaseId: purchase.id,
          providerSubscriptionId: providerObjectId,
          providerPlanId: purchase.providerReference,
          checkoutUrl,
          providerStatus: providerSubscription.status,
          currentPeriodEnd,
        }) ?? purchase;
      } else if (providerStatus === 'PAST_DUE') {
        processedPurchase = await prisma.billingPurchase.update({
          where: { id: purchase.id },
          data: { status: 'FAILED' },
        });
      }

      await prisma.billingWebhookEvent.update({
        where: { id: event.id },
        data: {
          subscriptionId: processedPurchase.subscriptionId,
          processedAt: new Date(),
        },
      });

      return { received: true };
    }

    const organizationId = externalReference;
    const subscription = await prisma.billingSubscription.findFirst({
      where: {
        OR: [
          { providerSubscriptionId: providerObjectId },
          ...(organizationId ? [{ organizationId }] : []),
        ],
      },
    });

    if (subscription && providerSubscription) {
      const nextStatus = mapMercadoPagoStatus(providerSubscription.status);
      const now = new Date();
      const trialEndsAt = subscription.trialEndsAt ?? addDays(now, defaultBillingPlan.trialDays);
      const status = nextStatus === 'ACTIVE' && trialEndsAt > now ? 'TRIALING' : nextStatus;

      await prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          status,
          trialEndsAt,
          currentPeriodEnd: currentPeriodEnd ?? subscription.currentPeriodEnd,
          providerSubscriptionId: providerObjectId,
          checkoutUrl: checkoutUrl ?? subscription.checkoutUrl,
        },
      });

      await prisma.billingWebhookEvent.update({
        where: { id: event.id },
        data: {
          subscriptionId: subscription.id,
          processedAt: new Date(),
        },
      });
    } else {
      await prisma.billingWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    }

    return { received: true };
  });
}
