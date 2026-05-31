import { z } from 'zod';

export const billingCheckoutSchema = z.object({
  organizationId: z.string().min(1),
  maxInstances: z.number().int().min(1).max(500).default(1),
});

export const billingChangeInstanceLimitSchema = z.object({
  organizationId: z.string().min(1),
  maxInstances: z.number().int().min(1).max(500),
});

export const billingInstanceSlotsCheckoutSchema = z.object({
  organizationId: z.string().min(1),
  additionalInstances: z.number().int().min(1).max(500),
});

export const billingSubscriptionQuerySchema = z.object({
  organizationId: z.string().min(1).optional(),
});

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;
export type BillingChangeInstanceLimitInput = z.infer<typeof billingChangeInstanceLimitSchema>;
export type BillingInstanceSlotsCheckoutInput = z.infer<typeof billingInstanceSlotsCheckoutSchema>;
