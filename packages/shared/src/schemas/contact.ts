import { z } from 'zod';

export const contactSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  ddi: z.string(),
  ddd: z.string(),
  number: z.string(),
  phoneE164: z.string(),
  remoteJid: z.string(),
});

export const contactQuerySchema = z.object({
  organizationId: z.string().min(1).optional(),
});

export const createContactSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  ddi: z.string().trim().regex(/^\d{1,3}$/),
  ddd: z.string().trim().regex(/^\d{1,4}$/).optional(),
  number: z.string().trim().regex(/^\d{6,12}$/).optional(),
  phone: z.string().trim().regex(/^[\d\s().-]{6,24}$/).optional(),
}).refine(data => Boolean(data.phone || (data.ddd && data.number)), {
  message: 'Phone or DDD plus number is required',
  path: ['phone'],
});

export type Contact = z.infer<typeof contactSchema>;
export type ContactQuery = z.infer<typeof contactQuerySchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
